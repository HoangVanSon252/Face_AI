from datetime import datetime, date, timedelta
from pydantic import BaseModel, Field
from sqlalchemy import func

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import dependencies
from app.crud import crud_attendance
from app.models.attendance import SessionStatusEnum, AttendanceSession
from app.models.user import RoleEnum
from app.schemas.attendance import (
    AttendanceSessionCreate,
    AttendanceSessionResponse,
    AttendanceSessionUpdate,
)
from app.core.config import settings
from app.services import notifications
from app.services.audit_service import write_audit_log
from app.services.realtime import realtime_service

router = APIRouter()
STAFF = [RoleEnum.LECTURER.value, RoleEnum.ADMIN.value]


def _local_to_utc(day: date, hour: int, minute: int) -> datetime:
    """Campus wall-clock time -> naive UTC as stored in the database."""
    return datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute) - timedelta(
        minutes=settings.APP_UTC_OFFSET_MINUTES
    )


def _session_name(session: AttendanceSession) -> str:
    return session.title or f"Buổi {session.session_no}"


def _notify_schedule_change(db: Session, session: AttendanceSession, actor_id: int, kind: str, title: str) -> None:
    section = session.section
    recipients = notifications.section_student_ids(db, session.section_id) + [section.lecturer_id]
    body = f"{notifications.section_label(section)} · {notifications.local_time(session.scheduled_start_at)}"
    notifications.notify(db, notifications.others(recipients, actor_id), kind, title, body, link="/attendance")


class SemesterScheduleBatchCreate(BaseModel):
    days_of_week: list[int] = Field(..., description="0=Monday, 1=Tuesday, ..., 6=Sunday")
    start_time: str = Field(..., description="HH:MM e.g. 08:00")
    end_time: str = Field(..., description="HH:MM e.g. 10:00")
    late_minutes: int = Field(default=15, ge=0, le=120)
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")
    total_sessions: int | None = Field(default=None, ge=1, le=50)
    title_prefix: str = Field(default="Buổi", max_length=100)


@router.post("/sections/{section_id}/sessions/batch", response_model=list[AttendanceSessionResponse], status_code=201)
def generate_semester_sessions(
    section_id: int,
    data: SemesterScheduleBatchCreate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.LECTURER.value, RoleEnum.ADMIN.value])),
):
    section = dependencies.require_section_access(db, section_id, current_user)
    now = datetime.utcnow()

    try:
        start_d = date.fromisoformat(data.start_date)
        end_d = date.fromisoformat(data.end_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Định dạng ngày không hợp lệ (cần YYYY-MM-DD)")

    if end_d < start_d:
        raise HTTPException(status_code=422, detail="Ngày kết thúc phải sau ngày bắt đầu")

    try:
        start_h, start_m = map(int, data.start_time.split(":"))
        end_h, end_m = map(int, data.end_time.split(":"))
    except ValueError:
        raise HTTPException(status_code=422, detail="Định dạng giờ không hợp lệ (cần HH:MM)")
    if (end_h, end_m) <= (start_h, start_m):
        raise HTTPException(status_code=422, detail="Giờ kết thúc phải sau giờ bắt đầu")
    if not data.days_of_week or any(day not in range(7) for day in data.days_of_week):
        raise HTTPException(status_code=422, detail="Chọn ít nhất một thứ trong tuần")

    # Replace only editable future timetable entries; attendance history stays intact.
    replaced_count = db.query(AttendanceSession).filter(
        AttendanceSession.section_id == section_id,
        AttendanceSession.status == SessionStatusEnum.SCHEDULED,
        AttendanceSession.scheduled_start_at >= now,
    ).delete(synchronize_session=False)
    db.flush()

    curr_max = (
        db.query(func.max(AttendanceSession.session_no))
        .filter(AttendanceSession.section_id == section_id)
        .scalar()
        or 0
    )

    curr_date = start_d
    created = []

    while curr_date <= end_d:
        st = _local_to_utc(curr_date, start_h, start_m)
        # Days already gone this semester are skipped: the schedule covers what is left.
        if curr_date.weekday() in data.days_of_week and st >= now:
            curr_max += 1
            et = _local_to_utc(curr_date, end_h, end_m)
            late = min(st + timedelta(minutes=data.late_minutes), et)

            sess = AttendanceSession(
                section_id=section_id,
                created_by=section.lecturer_id,
                session_no=curr_max,
                title=f"{data.title_prefix} {curr_max}",
                status=SessionStatusEnum.SCHEDULED,
                scheduled_start_at=st,
                scheduled_end_at=et,
                late_after_at=late,
            )
            db.add(sess)
            created.append(sess)

            if data.total_sessions and len(created) >= data.total_sessions:
                break

        curr_date += timedelta(days=1)

    if not created:
        raise HTTPException(status_code=422, detail="Không còn ngày nào phù hợp với thứ đã chọn trong phần còn lại của học kỳ")

    recipients = notifications.section_student_ids(db, section_id) + [section.lecturer_id]
    notifications.notify(
        db, notifications.others(recipients, current_user.id), "SCHEDULE_UPDATED",
        f"Lịch học {notifications.section_label(section)} đã được cập nhật",
        f"{len(created)} buổi, buổi đầu lúc {notifications.local_time(created[0].scheduled_start_at)}.",
        link="/attendance",
    )
    db.commit()
    for s in created:
        db.refresh(s)

    write_audit_log(
        db, action="SEMESTER_SESSIONS_GENERATED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_SESSION", entity_id=section_id,
        details={"section_id": section_id, "count": len(created), "replaced_future_scheduled_count": replaced_count}
    )
    db.commit()
    return created


@router.post("/sections/{section_id}/sessions", response_model=AttendanceSessionResponse, status_code=201)
def create_session(
    section_id: int,
    data: AttendanceSessionCreate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.LECTURER.value, RoleEnum.ADMIN.value])),
):
    section = dependencies.require_section_access(db, section_id, current_user)
    try:
        # Sessions belong to the section's lecturer even when an admin schedules them.
        session = crud_attendance.create_session(db, section_id, section.lecturer_id, data)
        _notify_schedule_change(db, session, current_user.id, "SESSION_ADDED", f"Thêm buổi học: {_session_name(session)}")
        write_audit_log(
            db, action="SESSION_CREATED", actor_user_id=current_user.id,
            entity_type="ATTENDANCE_SESSION", entity_id=session.id,
            details={"section_id": section_id, "session_no": session.session_no},
        )
        db.commit()
        db.refresh(session)
        return session
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Session number already exists in this section")


@router.patch("/sessions/{session_id}", response_model=AttendanceSessionResponse)
def update_session(
    session_id: int,
    data: AttendanceSessionUpdate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.SCHEDULED:
        raise HTTPException(status_code=409, detail="Only scheduled sessions can be updated")

    start = data.scheduled_start_at or session.scheduled_start_at
    end = data.scheduled_end_at or session.scheduled_end_at
    late = data.late_after_at or session.late_after_at

    if end <= start:
        raise HTTPException(status_code=422, detail="scheduled_end_at must be after scheduled_start_at")
    if late < start or late > end:
        raise HTTPException(status_code=422, detail="late_after_at must be between scheduled_start_at and scheduled_end_at")

    old_start = session.scheduled_start_at
    updated = crud_attendance.update_session(db, session, data)
    if updated.scheduled_start_at != old_start:
        _notify_schedule_change(
            db, updated, current_user.id, "SESSION_RESCHEDULED",
            f"Đổi lịch {_session_name(updated)} (trước: {notifications.local_time(old_start)})",
        )
    write_audit_log(
        db, action="SESSION_UPDATED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_SESSION", entity_id=session.id,
        details={"section_id": session.section_id, "session_no": session.session_no},
    )
    db.commit()
    db.refresh(updated)
    return updated


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status not in {SessionStatusEnum.SCHEDULED, SessionStatusEnum.CANCELLED}:
        raise HTTPException(status_code=409, detail="Only scheduled or cancelled sessions can be deleted")

    has_records = db.query(crud_attendance.AttendanceRecord.id).filter(
        crud_attendance.AttendanceRecord.session_id == session_id
    ).first() is not None
    if has_records:
        raise HTTPException(status_code=409, detail="Cannot delete session that already has attendance records")

    if session.status == SessionStatusEnum.SCHEDULED and session.scheduled_start_at >= datetime.utcnow():
        _notify_schedule_change(db, session, current_user.id, "SESSION_REMOVED", f"Hủy buổi học: {_session_name(session)}")
    crud_attendance.delete_session(db, session)
    write_audit_log(
        db, action="SESSION_DELETED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_SESSION", entity_id=session_id,
        details={"section_id": session.section_id, "session_no": session.session_no},
    )
    db.commit()
    return None


@router.get("/sections/{section_id}/sessions", response_model=list[AttendanceSessionResponse])
def list_sessions(
    section_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.ADMIN.value, RoleEnum.LECTURER.value])),
):
    dependencies.require_section_access(db, section_id, current_user)
    return crud_attendance.list_sessions(db, section_id)


@router.get("/sessions/{session_id}", response_model=AttendanceSessionResponse)
def get_session(
    session_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.ADMIN.value, RoleEnum.LECTURER.value])),
):
    return dependencies.require_session_access(db, session_id, current_user)


@router.post("/sessions/{session_id}/open", response_model=AttendanceSessionResponse)
def open_session(
    session_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.LECTURER.value])),
):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.SCHEDULED:
        raise HTTPException(status_code=409, detail="Only scheduled sessions can be opened")
    if crud_attendance.has_open_session(db, session.section_id, exclude_id=session.id):
        raise HTTPException(status_code=409, detail="Another attendance session is already open")
    if crud_attendance.has_open_session_for_lecturer(db, current_user.id, exclude_id=session.id):
        raise HTTPException(
            status_code=409,
            detail="You already have an open attendance session. Close it before opening another class.",
        )
    session.status = SessionStatusEnum.OPEN
    session.opened_at = datetime.utcnow()
    notifications.notify(
        db, notifications.section_student_ids(db, session.section_id), "SESSION_OPENED",
        f"Đang mở điểm danh: {_session_name(session)}",
        f"{notifications.section_label(session.section)}. Hãy đứng trước camera của lớp để điểm danh.",
        link="/attendance",
    )
    write_audit_log(
        db, action="SESSION_OPENED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_SESSION", entity_id=session.id,
    )
    db.commit()
    db.refresh(session)
    background_tasks.add_task(realtime_service.publish, session.id, "session_status", {"status": "OPEN"})
    return session


@router.post("/sessions/{session_id}/close", response_model=AttendanceSessionResponse)
def close_session(
    session_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.LECTURER.value])),
):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.OPEN:
        raise HTTPException(status_code=409, detail="Only open sessions can be closed")
    session.status = SessionStatusEnum.CLOSED
    session.closed_at = datetime.utcnow()
    write_audit_log(
        db, action="SESSION_CLOSED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_SESSION", entity_id=session.id,
    )
    db.commit()
    db.refresh(session)
    background_tasks.add_task(realtime_service.publish, session.id, "session_status", {"status": "CLOSED"})
    return session


@router.post("/sessions/{session_id}/cancel", response_model=AttendanceSessionResponse)
def cancel_session(
    session_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.SCHEDULED:
        raise HTTPException(status_code=409, detail="Only scheduled sessions can be cancelled")
    session.status = SessionStatusEnum.CANCELLED
    _notify_schedule_change(db, session, current_user.id, "SESSION_CANCELLED", f"Hủy buổi học: {_session_name(session)}")
    write_audit_log(
        db, action="SESSION_CANCELLED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_SESSION", entity_id=session.id,
    )
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions", response_model=list[AttendanceSessionResponse])
def list_all_accessible_sessions(
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.get_current_active_user),
):
    from app.models.course import ClassSection, Enrollment, EnrollmentStatusEnum
    query = db.query(crud_attendance.AttendanceSession)
    if current_user.role == RoleEnum.LECTURER:
        query = query.join(ClassSection, crud_attendance.AttendanceSession.section_id == ClassSection.id).filter(ClassSection.lecturer_id == current_user.id)
    elif current_user.role == RoleEnum.STUDENT:
        query = query.join(Enrollment, crud_attendance.AttendanceSession.section_id == Enrollment.section_id).filter(
            Enrollment.student_id == current_user.id,
            Enrollment.status == EnrollmentStatusEnum.ENROLLED,
        )
    return query.order_by(crud_attendance.AttendanceSession.scheduled_start_at.desc(), crud_attendance.AttendanceSession.id.desc()).all()

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import dependencies
from app.crud import crud_attendance
from app.models.attendance import AppealStatusEnum, AttendanceStatusEnum, ReviewStatusEnum, SessionStatusEnum, VerificationMethodEnum
from app.models.user import RoleEnum
from app.schemas.attendance import (
    AppealCreate,
    AppealResolveRequest,
    AppealResponse,
    AttendanceManualUpdate,
    AttendancePage,
    AttendanceRecordResponse,
    AttendanceReviewRequest,
    ManualCheckInCreate,
)
from app.services.audit_service import write_audit_log
from app.services.realtime import realtime_service

router = APIRouter()
STAFF = [RoleEnum.ADMIN.value, RoleEnum.LECTURER.value]


@router.post("/sessions/{session_id}/attendance", response_model=AttendanceRecordResponse, status_code=201)
def create_manual_check_in(
    session_id: int,
    data: ManualCheckInCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.LECTURER.value])),
):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.OPEN:
        raise HTTPException(status_code=409, detail="Attendance session is not open")
    if not crud_attendance.is_enrolled(db, session.section_id, data.student_id):
        raise HTTPException(status_code=403, detail="Student is not enrolled in this section")
    try:
        record = crud_attendance.create_manual_check_in(
            db, session, data.student_id, data.check_in_at or datetime.utcnow(), data.note
        )
        write_audit_log(
            db, action="ATTENDANCE_CREATED", actor_user_id=current_user.id,
            entity_type="ATTENDANCE_RECORD", entity_id=record.id,
            details={"session_id": session_id, "student_id": data.student_id},
        )
        db.commit()
        db.refresh(record)
        background_tasks.add_task(
            realtime_service.publish,
            session_id,
            "attendance_detected",
            {
                "record_id": record.id,
                "student_id": record.student_id,
                "status": record.status.value,
                "check_in_at": record.check_in_at.isoformat() if record.check_in_at else None,
            },
        )
        return record
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="ALREADY_CHECKED_IN")


@router.get("/sessions/{session_id}/attendance", response_model=AttendancePage)
def list_attendance(
    session_id: int,
    status: AttendanceStatusEnum | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    dependencies.require_session_access(db, session_id, current_user)
    items, total = crud_attendance.list_records(db, session_id, status, page, page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.patch("/attendance/{record_id}", response_model=AttendanceRecordResponse)
def update_attendance(
    record_id: int,
    data: AttendanceManualUpdate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    record = dependencies.require_record_staff_access(db, record_id, current_user)
    record.status = data.status
    record.note = data.note
    record.review_status = ReviewStatusEnum.APPROVED
    record.reviewed_by = current_user.id if current_user.role == RoleEnum.LECTURER else None
    record.reviewed_at = datetime.utcnow()
    write_audit_log(
        db, action="ATTENDANCE_UPDATED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_RECORD", entity_id=record.id,
        details={"status": data.status.value},
    )
    db.commit()
    db.refresh(record)
    return record


@router.get("/students/me/attendance", response_model=list[AttendanceRecordResponse])
def get_my_attendance(
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.STUDENT.value])),
):
    return crud_attendance.list_student_records(db, current_user.id, start_at, end_at)


@router.get("/sessions/{session_id}/review-queue", response_model=list[AttendanceRecordResponse])
def review_queue(
    session_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    dependencies.require_session_access(db, session_id, current_user)
    return crud_attendance.list_pending_records(db, session_id)


def _review_record(record_id: int, approved: bool, data: AttendanceReviewRequest, db: Session, current_user):
    record = dependencies.require_record_staff_access(db, record_id, current_user)
    if record.review_status != ReviewStatusEnum.PENDING:
        raise HTTPException(status_code=409, detail="Only pending records can be reviewed")
    record.review_status = ReviewStatusEnum.APPROVED if approved else ReviewStatusEnum.REJECTED
    if not approved:
        record.status = AttendanceStatusEnum.ABSENT
    record.reviewed_by = current_user.id if current_user.role == RoleEnum.LECTURER else None
    record.reviewed_at = datetime.utcnow()
    record.note = data.note
    write_audit_log(
        db, action="ATTENDANCE_REVIEW_APPROVED" if approved else "ATTENDANCE_REVIEW_REJECTED",
        actor_user_id=current_user.id, entity_type="ATTENDANCE_RECORD", entity_id=record.id,
    )
    db.commit()
    db.refresh(record)
    return record


@router.post("/attendance/{record_id}/approve", response_model=AttendanceRecordResponse)
def approve_attendance(record_id: int, data: AttendanceReviewRequest, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.require_role(STAFF))):
    return _review_record(record_id, True, data, db, current_user)


@router.post("/attendance/{record_id}/reject", response_model=AttendanceRecordResponse)
def reject_attendance(record_id: int, data: AttendanceReviewRequest, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.require_role(STAFF))):
    return _review_record(record_id, False, data, db, current_user)


@router.post("/attendance/{record_id}/appeals", response_model=AppealResponse, status_code=201)
def create_appeal(
    record_id: int,
    data: AppealCreate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.STUDENT.value])),
):
    record = crud_attendance.get_record(db, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if record.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        appeal = crud_attendance.create_appeal(db, record_id, current_user.id, data.reason, data.evidence_uri)
        write_audit_log(
            db, action="APPEAL_CREATED", actor_user_id=current_user.id,
            entity_type="ATTENDANCE_APPEAL", entity_id=appeal.id,
            details={"attendance_record_id": record_id},
        )
        db.commit()
        db.refresh(appeal)
        return appeal
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A pending or prior appeal already exists for this record")


@router.get("/appeals/me", response_model=list[AppealResponse])
def my_appeals(db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.require_role([RoleEnum.STUDENT.value]))):
    return crud_attendance.list_student_appeals(db, current_user.id)


@router.get("/sessions/{session_id}/appeals", response_model=list[AppealResponse])
def session_appeals(session_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.require_role(STAFF))):
    dependencies.require_session_access(db, session_id, current_user)
    return crud_attendance.list_session_appeals(db, session_id)


@router.post("/appeals/{appeal_id}/resolve", response_model=AppealResponse)
def resolve_appeal(
    appeal_id: int,
    data: AppealResolveRequest,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    appeal = crud_attendance.get_appeal(db, appeal_id)
    if appeal is None:
        raise HTTPException(status_code=404, detail="Appeal not found")
    record = dependencies.require_record_staff_access(db, appeal.attendance_record_id, current_user)
    if appeal.status != AppealStatusEnum.PENDING:
        raise HTTPException(status_code=409, detail="Only pending appeals can be resolved")
    appeal.status = data.decision
    appeal.resolved_by = current_user.id if current_user.role == RoleEnum.LECTURER else None
    appeal.resolution_note = data.resolution_note
    appeal.resolved_at = datetime.utcnow()
    if data.decision == AppealStatusEnum.APPROVED:
        if data.attendance_status is None:
            raise HTTPException(status_code=422, detail="attendance_status is required when approving an appeal")
        record.status = data.attendance_status
        record.verification_method = VerificationMethodEnum.MANUAL
        record.review_status = ReviewStatusEnum.APPROVED
        record.reviewed_by = current_user.id if current_user.role == RoleEnum.LECTURER else None
        record.reviewed_at = datetime.utcnow()
    write_audit_log(db, action="APPEAL_RESOLVED", actor_user_id=current_user.id, entity_type="ATTENDANCE_APPEAL", entity_id=appeal.id, details={"decision": data.decision.value})
    db.commit()
    db.refresh(appeal)
    return appeal

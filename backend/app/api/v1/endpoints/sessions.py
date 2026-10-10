from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import dependencies
from app.crud import crud_attendance
from app.models.attendance import SessionStatusEnum
from app.models.user import RoleEnum
from app.schemas.attendance import AttendanceSessionCreate, AttendanceSessionResponse
from app.services.audit_service import write_audit_log
from app.services.realtime import realtime_service

router = APIRouter()


@router.post("/sections/{section_id}/sessions", response_model=AttendanceSessionResponse, status_code=201)
def create_session(
    section_id: int,
    data: AttendanceSessionCreate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role([RoleEnum.LECTURER.value])),
):
    dependencies.require_section_access(db, section_id, current_user)
    try:
        session = crud_attendance.create_session(db, section_id, current_user.id, data)
        write_audit_log(
            db, action="SESSION_CREATED", actor_user_id=current_user.id,
            entity_type="ATTENDANCE_SESSION", entity_id=session.id,
            details={"section_id": section_id, "session_no": data.session_no},
        )
        db.commit()
        db.refresh(session)
        return session
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Session number already exists in this section")


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
    session.status = SessionStatusEnum.OPEN
    session.opened_at = datetime.utcnow()
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
    current_user=Depends(dependencies.require_role([RoleEnum.LECTURER.value])),
):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.SCHEDULED:
        raise HTTPException(status_code=409, detail="Only scheduled sessions can be cancelled")
    session.status = SessionStatusEnum.CANCELLED
    write_audit_log(
        db, action="SESSION_CANCELLED", actor_user_id=current_user.id,
        entity_type="ATTENDANCE_SESSION", entity_id=session.id,
    )
    db.commit()
    db.refresh(session)
    return session

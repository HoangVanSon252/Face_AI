import csv
from io import StringIO
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api import dependencies
from app.crud import crud_attendance
from app.models.attendance import AttendanceSession
from app.models.user import RoleEnum
from app.schemas.attendance import SessionSummary
from app.core.config import settings

router = APIRouter()
STAFF = [RoleEnum.ADMIN.value, RoleEnum.LECTURER.value]


@router.get("/reports/sessions/{session_id}", response_model=SessionSummary)
def get_session_report(
    session_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    dependencies.require_session_access(db, session_id, current_user)
    return crud_attendance.session_summary(db, session_id)


@router.get("/reports/sections/{section_id}", response_model=list[SessionSummary])
def get_section_report(
    section_id: int,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    dependencies.require_section_access(db, section_id, current_user)
    query = db.query(AttendanceSession).filter(AttendanceSession.section_id == section_id)
    if start_at is not None:
        query = query.filter(AttendanceSession.scheduled_start_at >= start_at)
    if end_at is not None:
        query = query.filter(AttendanceSession.scheduled_start_at <= end_at)
    sessions = query.all()
    return [crud_attendance.session_summary(db, session.id) for session in sessions]


@router.get("/reports/sessions/{session_id}/export")
def export_session_csv(
    session_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    dependencies.require_session_access(db, session_id, current_user)
    records, _ = crud_attendance.list_records(db, session_id, None, 1, settings.REPORT_MAX_ROWS)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["record_id", "student_id", "status", "method", "check_in_at", "review_status", "note"])
    for record in records:
        writer.writerow([
            record.id,
            record.student_id,
            record.status.value,
            record.verification_method.value,
            record.check_in_at.isoformat() if record.check_in_at else "",
            record.review_status.value,
            record.note or "",
        ])
    filename = f"attendance-session-{session_id}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

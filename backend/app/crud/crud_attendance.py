from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.attendance import (
    AppealStatusEnum,
    AttendanceAppeal,
    AttendanceRecord,
    AttendanceSession,
    AttendanceStatusEnum,
    ReviewStatusEnum,
    SessionStatusEnum,
    VerificationMethodEnum,
)
from app.models.course import Enrollment, EnrollmentStatusEnum
from app.schemas.attendance import AttendanceSessionCreate


def get_session(db: Session, session_id: int) -> AttendanceSession | None:
    return db.get(AttendanceSession, session_id)


def create_session(
    db: Session,
    section_id: int,
    created_by: int,
    data: AttendanceSessionCreate,
) -> AttendanceSession:
    session = AttendanceSession(
        section_id=section_id,
        created_by=created_by,
        **data.model_dump(),
    )
    db.add(session)
    db.flush()
    return session


def list_sessions(db: Session, section_id: int) -> list[AttendanceSession]:
    return (
        db.query(AttendanceSession)
        .filter(AttendanceSession.section_id == section_id)
        .order_by(AttendanceSession.session_no.desc())
        .all()
    )


def has_open_session(db: Session, section_id: int, exclude_id: int | None = None) -> bool:
    query = db.query(AttendanceSession).filter(
        AttendanceSession.section_id == section_id,
        AttendanceSession.status == SessionStatusEnum.OPEN,
    )
    if exclude_id is not None:
        query = query.filter(AttendanceSession.id != exclude_id)
    return query.first() is not None


def is_enrolled(db: Session, section_id: int, student_id: int) -> bool:
    return (
        db.query(Enrollment.id)
        .filter(
            Enrollment.section_id == section_id,
            Enrollment.student_id == student_id,
            Enrollment.status == EnrollmentStatusEnum.ENROLLED,
        )
        .first()
        is not None
    )


def get_record(db: Session, record_id: int) -> AttendanceRecord | None:
    return db.get(AttendanceRecord, record_id)


def create_manual_check_in(
    db: Session,
    session: AttendanceSession,
    student_id: int,
    check_in_at: datetime,
    note: str | None,
) -> AttendanceRecord:
    status = (
        AttendanceStatusEnum.LATE
        if check_in_at > session.late_after_at
        else AttendanceStatusEnum.PRESENT
    )
    record = AttendanceRecord(
        session_id=session.id,
        student_id=student_id,
        status=status,
        verification_method=VerificationMethodEnum.MANUAL,
        check_in_at=check_in_at,
        review_status=ReviewStatusEnum.APPROVED,
        note=note,
    )
    db.add(record)
    db.flush()
    return record


def list_records(
    db: Session,
    session_id: int,
    status: AttendanceStatusEnum | None,
    page: int,
    page_size: int,
) -> tuple[list[AttendanceRecord], int]:
    query = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session_id)
    if status is not None:
        query = query.filter(AttendanceRecord.status == status)
    total = query.count()
    records = (
        query.order_by(AttendanceRecord.check_in_at.desc(), AttendanceRecord.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return records, total


def list_student_records(
    db: Session,
    student_id: int,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> list[AttendanceRecord]:
    query = db.query(AttendanceRecord).filter(AttendanceRecord.student_id == student_id)
    if start_at is not None:
        query = query.filter(AttendanceRecord.check_in_at >= start_at)
    if end_at is not None:
        query = query.filter(AttendanceRecord.check_in_at <= end_at)
    return query.order_by(AttendanceRecord.check_in_at.desc(), AttendanceRecord.id.desc()).all()


def list_pending_records(db: Session, session_id: int) -> list[AttendanceRecord]:
    return (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.session_id == session_id,
            AttendanceRecord.review_status == ReviewStatusEnum.PENDING,
        )
        .order_by(AttendanceRecord.created_at.asc())
        .all()
    )


def create_appeal(
    db: Session,
    record_id: int,
    student_id: int,
    reason: str,
    evidence_uri: str | None,
) -> AttendanceAppeal:
    appeal = AttendanceAppeal(
        attendance_record_id=record_id,
        student_id=student_id,
        reason=reason,
        evidence_uri=evidence_uri,
    )
    db.add(appeal)
    db.flush()
    return appeal


def get_appeal(db: Session, appeal_id: int) -> AttendanceAppeal | None:
    return db.get(AttendanceAppeal, appeal_id)


def list_student_appeals(db: Session, student_id: int) -> list[AttendanceAppeal]:
    return (
        db.query(AttendanceAppeal)
        .filter(AttendanceAppeal.student_id == student_id)
        .order_by(AttendanceAppeal.created_at.desc())
        .all()
    )


def list_session_appeals(db: Session, session_id: int) -> list[AttendanceAppeal]:
    return (
        db.query(AttendanceAppeal)
        .join(AttendanceRecord, AttendanceAppeal.attendance_record_id == AttendanceRecord.id)
        .filter(AttendanceRecord.session_id == session_id)
        .order_by(AttendanceAppeal.created_at.desc())
        .all()
    )


def session_summary(db: Session, session_id: int) -> dict[str, int]:
    counts = dict(
        db.query(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .filter(AttendanceRecord.session_id == session_id)
        .group_by(AttendanceRecord.status)
        .all()
    )
    return {
        "session_id": session_id,
        "total": sum(counts.values()),
        "present": counts.get(AttendanceStatusEnum.PRESENT, 0),
        "late": counts.get(AttendanceStatusEnum.LATE, 0),
        "absent": counts.get(AttendanceStatusEnum.ABSENT, 0),
        "excused": counts.get(AttendanceStatusEnum.EXCUSED, 0),
    }

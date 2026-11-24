"""Business notifications for students, lecturers and admins.

`notify()` stores one row per recipient inside the caller's transaction. The
rows are pushed over the user WebSocket only after that transaction commits,
so nobody is told about a change that was rolled back. Delivery goes through
the same Redis channel as the other realtime events, which reaches the user's
socket on whichever worker holds it. If Redis is down the rows are still in
the database and the bell picks them up on the next load.
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Iterable

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.course import ClassSection, Enrollment, EnrollmentStatusEnum
from app.models.notification import Notification
from app.services.realtime import CHANNEL

logger = logging.getLogger("face_attendance")
EVENT = "NOTIFICATION"
_PENDING_KEY = "pending_notifications"

_redis: Redis | None = None


def _client() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
    return _redis


def serialize(item: Notification) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "body": item.body,
        "link": item.link,
        "is_read": bool(item.is_read),
        "created_at": item.created_at.isoformat() + "Z" if item.created_at else None,
    }


def notify(db: Session, user_ids: Iterable[int], kind: str, title: str, body: str | None = None, link: str | None = None) -> None:
    recipients = sorted({int(user_id) for user_id in user_ids if user_id})
    if not recipients:
        return
    now = datetime.utcnow()
    rows = [
        Notification(user_id=user_id, kind=kind, title=title[:200], body=body[:500] if body else None, link=link, is_read=False, created_at=now)
        for user_id in recipients
    ]
    db.add_all(rows)
    db.flush()
    db.info.setdefault(_PENDING_KEY, []).extend((row.user_id, serialize(row)) for row in rows)


@event.listens_for(Session, "after_commit")
def _push_after_commit(session: Session) -> None:
    pending = session.info.pop(_PENDING_KEY, None)
    if not pending:
        return
    try:
        pipe = _client().pipeline(transaction=False)
        for user_id, payload in pending:
            pipe.publish(CHANNEL, json.dumps({"user_id": user_id, "event": EVENT, "payload": payload}))
        pipe.execute()
    except RedisError:
        logger.warning("notification_push_failed", extra={"count": len(pending)})


@event.listens_for(Session, "after_rollback")
def _drop_after_rollback(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)


def local_time(value: datetime | None) -> str:
    """Naive UTC from the database -> campus wall-clock text, e.g. '08:00 03/11/2026'."""
    if value is None:
        return ""
    return (value + timedelta(minutes=settings.APP_UTC_OFFSET_MINUTES)).strftime("%H:%M %d/%m/%Y")


def section_label(section: ClassSection) -> str:
    course = section.course.course_name if section.course is not None else ""
    return f"{section.section_code} · {course}" if course else section.section_code


def section_student_ids(db: Session, section_id: int) -> list[int]:
    rows = db.query(Enrollment.student_id).filter(
        Enrollment.section_id == section_id,
        Enrollment.status == EnrollmentStatusEnum.ENROLLED,
    ).all()
    return [row.student_id for row in rows]


def others(user_ids: Iterable[int], actor_id: int) -> list[int]:
    """Recipients minus the person who made the change (they already know)."""
    return [user_id for user_id in user_ids if user_id != actor_id]


STATUS_LABELS = {"PRESENT": "Có mặt", "LATE": "Đi muộn", "ABSENT": "Vắng", "EXCUSED": "Có phép"}


def session_name(session) -> str:
    return session.title or f"Buổi {session.session_no}"


def notify_check_in(db: Session, record) -> None:
    """Tell the student their attendance was recorded (face or manual)."""
    session = record.session
    pending = record.review_status.value == "PENDING"
    title = f"Đã điểm danh {session_name(session)}: {STATUS_LABELS.get(record.status.value, record.status.value)}"
    if pending:
        title += " (chờ giảng viên xác nhận)"
    body = f"{section_label(session.section)} · lúc {local_time(record.check_in_at)}"
    notify(db, [record.student_id], "ATTENDANCE_RECORDED", title, body, link="/attendance/history")

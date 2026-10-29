"""Open N attendance sessions of one lecturer for a load test, then restore them.

Run inside the backend container (it uses the app's DB settings):
    docker compose exec -T backend python - open 10 < scripts/loadtest/prepare_sessions.py
    docker compose exec -T backend python - open-ids 15 < scripts/loadtest/prepare_sessions.py
    docker compose exec -T backend python - restore < scripts/loadtest/prepare_sessions.py

`open` prints the session ids as JSON and saves the original status/times to
/tmp/loadtest_sessions.json inside the container; `restore` puts them back and
deletes any attendance record the test created in those sessions.
"""
import json
import sys
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models.attendance import AttendanceRecord, AttendanceSession, SessionStatusEnum
from app.models.course import ClassSection
from app.models.user import User

STATE_FILE = "/tmp/loadtest_sessions.json"
LECTURER = "teacher"


def open_sessions(count: int, only_ids: list[int] | None = None) -> None:
    db = SessionLocal()
    lecturer = db.query(User).filter(User.username == LECTURER).one()
    # One session per section: the recognize rate limit and the matcher cache are per session/section.
    sessions = []
    seen_sections = set()
    for session in (
        db.query(AttendanceSession)
        .join(ClassSection, ClassSection.id == AttendanceSession.section_id)
        .filter(ClassSection.lecturer_id == lecturer.id, AttendanceSession.status == SessionStatusEnum.SCHEDULED)
        .order_by(AttendanceSession.id)
    ):
        if session.section_id in seen_sections:
            continue
        seen_sections.add(session.section_id)
        sessions.append(session)
        if len(sessions) == count:
            break
    if only_ids:
        sessions = [db.get(AttendanceSession, session_id) for session_id in only_ids]
    if len(sessions) < count and not only_ids:
        # Fewer sections than requested: reuse sections with extra sessions.
        extra = (
            db.query(AttendanceSession)
            .join(ClassSection, ClassSection.id == AttendanceSession.section_id)
            .filter(
                ClassSection.lecturer_id == lecturer.id,
                AttendanceSession.status == SessionStatusEnum.SCHEDULED,
                AttendanceSession.id.notin_([item.id for item in sessions]),
            )
            .order_by(AttendanceSession.id)
            .limit(count - len(sessions))
        )
        sessions.extend(extra)
    now = datetime.utcnow()
    original = []
    for session in sessions:
        original.append({
            "id": session.id,
            "status": session.status.value,
            "scheduled_start_at": session.scheduled_start_at.isoformat(),
            "scheduled_end_at": session.scheduled_end_at.isoformat(),
            "late_after_at": session.late_after_at.isoformat() if session.late_after_at else None,
            "opened_at": session.opened_at.isoformat() if session.opened_at else None,
        })
        session.status = SessionStatusEnum.OPEN
        session.scheduled_start_at = now - timedelta(minutes=5)
        session.scheduled_end_at = now + timedelta(hours=2)
        session.late_after_at = now + timedelta(hours=1)
        session.opened_at = now
    db.commit()
    with open(STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(original, handle)
    print(json.dumps([item["id"] for item in original]))


def restore() -> None:
    with open(STATE_FILE, encoding="utf-8") as handle:
        original = json.load(handle)
    db = SessionLocal()
    ids = [item["id"] for item in original]
    from app.services.object_storage import delete_object

    records = db.query(AttendanceRecord).filter(AttendanceRecord.session_id.in_(ids)).all()
    for record in records:
        if record.evidence_image_uri:
            delete_object(record.evidence_image_uri)
        db.delete(record)
    created = len(records)
    for item in original:
        session = db.get(AttendanceSession, item["id"])
        session.status = SessionStatusEnum(item["status"])
        session.scheduled_start_at = datetime.fromisoformat(item["scheduled_start_at"])
        session.scheduled_end_at = datetime.fromisoformat(item["scheduled_end_at"])
        session.late_after_at = datetime.fromisoformat(item["late_after_at"]) if item["late_after_at"] else None
        session.opened_at = datetime.fromisoformat(item["opened_at"]) if item["opened_at"] else None
    db.commit()
    print(json.dumps({"restored_sessions": ids, "records_deleted": created}))


if __name__ == "__main__":
    if sys.argv[1] == "open":
        open_sessions(int(sys.argv[2]))
    elif sys.argv[1] == "open-ids":
        ids = [int(value) for value in sys.argv[2].split(",")]
        open_sessions(len(ids), ids)
    elif sys.argv[1] == "restore":
        restore()
    else:
        raise SystemExit("usage: open N | open-ids 15,16 | restore")

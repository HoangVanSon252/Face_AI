from datetime import datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.attendance import AttendanceSessionCreate


def test_session_schema_rejects_invalid_schedule():
    start = datetime(2026, 1, 1, 8, 0)
    with pytest.raises(ValidationError):
        AttendanceSessionCreate(
            session_no=1,
            scheduled_start_at=start,
            scheduled_end_at=start,
            late_after_at=start,
        )


def test_session_schema_accepts_valid_schedule():
    start = datetime(2026, 1, 1, 8, 0)
    session = AttendanceSessionCreate(
        session_no=1,
        scheduled_start_at=start,
        scheduled_end_at=start + timedelta(hours=2),
        late_after_at=start + timedelta(minutes=15),
    )
    assert session.session_no == 1


def test_session_schema_normalizes_iso_utc():
    session = AttendanceSessionCreate(
        session_no=None,
        scheduled_start_at="2026-10-16T08:00:00Z",
        scheduled_end_at="2026-10-16T10:00:00Z",
        late_after_at="2026-10-16T08:15:00Z",
    )
    assert session.session_no is None
    assert session.scheduled_start_at.hour == 8
    assert session.scheduled_start_at.tzinfo is None

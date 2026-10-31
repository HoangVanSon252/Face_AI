import json
from datetime import date, datetime

from app.api.v1.endpoints.sessions import _local_to_utc
from app.services import notifications


class FakeDb:
    def __init__(self):
        self.info = {}
        self.added = []

    def add_all(self, rows):
        self.added.extend(rows)

    def flush(self):
        for index, row in enumerate(self.added, start=1):
            row.id = index


class FakePipeline:
    def __init__(self, sink):
        self.sink = sink

    def publish(self, channel, message):
        self.sink.append((channel, json.loads(message)))

    def execute(self):
        return []


class FakeRedis:
    def __init__(self):
        self.published = []

    def pipeline(self, transaction=False):
        return FakePipeline(self.published)


def test_campus_time_round_trips_through_utc():
    stored = _local_to_utc(date(2026, 11, 2), 8, 0)

    assert stored == datetime(2026, 11, 2, 1, 0)
    assert notifications.local_time(stored) == "08:00 02/11/2026"


def test_notifications_are_pushed_only_after_commit(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(notifications, "_client", lambda: redis)
    db = FakeDb()

    notifications.notify(db, [7, 7, 8, None], "SESSION_OPENED", "Đang mở điểm danh")

    assert [row.user_id for row in db.added] == [7, 8]
    assert redis.published == []

    notifications._push_after_commit(db)

    assert [(m["user_id"], m["event"]) for _, m in redis.published] == [(7, "NOTIFICATION"), (8, "NOTIFICATION")]
    assert redis.published[0][1]["payload"]["title"] == "Đang mở điểm danh"
    assert db.info == {}


def test_rolled_back_notifications_are_never_pushed(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(notifications, "_client", lambda: redis)
    db = FakeDb()

    notifications.notify(db, [7], "SESSION_OPENED", "x")
    notifications._drop_after_rollback(db)
    notifications._push_after_commit(db)

    assert redis.published == []


def test_actor_is_not_notified_about_their_own_change():
    assert notifications.others([3, 5, 3], actor_id=3) == [5]

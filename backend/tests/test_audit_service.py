from app.services.audit_service import _sanitize_details, write_audit_log


class FakeSession:
    def __init__(self):
        self.added = []
        self.flush_calls = 0
        self.commit_calls = 0
        self.refresh_calls = 0

    def add(self, value):
        self.added.append(value)

    def flush(self):
        self.flush_calls += 1

    def commit(self):
        self.commit_calls += 1

    def refresh(self, _value):
        self.refresh_calls += 1


def test_sensitive_details_are_redacted_case_insensitively():
    result = _sanitize_details(
        {
            "username": "student01",
            "Password": "secret",
            "ACCESS_TOKEN": "token-value",
            "embedding_data": [0.1, 0.2],
        }
    )

    assert result["username"] == "student01"
    assert result["Password"] == "[REDACTED]"
    assert result["ACCESS_TOKEN"] == "[REDACTED]"
    assert result["embedding_data"] == "[REDACTED]"


def test_none_details_are_allowed():
    assert _sanitize_details(None) is None


def test_write_audit_log_flushes_without_committing_by_default():
    db = FakeSession()

    audit_log = write_audit_log(
        db,
        action="LOGIN_SUCCESS",
        actor_user_id=1,
        entity_type="USER",
        entity_id=1,
        details={"access_token": "secret"},
    )

    assert db.added == [audit_log]
    assert db.flush_calls == 1
    assert db.commit_calls == 0
    assert audit_log.details == {"access_token": "[REDACTED]"}

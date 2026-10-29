import time

import pytest
from fastapi import HTTPException

from app.core import csrf
from app.services import token_store


class FakeRedis:
    """Minimal in-memory stand-in for the commands token_store uses."""

    def __init__(self):
        self.data: dict[str, str] = {}

    def set(self, key, value, ex=None):
        self.data[key] = str(value)

    def get(self, key):
        return self.data.get(key)

    def exists(self, key):
        return int(key in self.data)

    def getdel(self, key):
        return self.data.pop(key, None)

    def pipeline(self):
        redis = self

        class Pipeline:
            def __init__(self):
                self.calls = []

            def exists(self, key):
                self.calls.append(lambda: redis.exists(key))
                return self

            def get(self, key):
                self.calls.append(lambda: redis.get(key))
                return self

            def execute(self):
                return [call() for call in self.calls]

        return Pipeline()


@pytest.fixture
def redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(token_store, "_client", lambda: fake)
    return fake


def test_logged_out_token_is_rejected_until_expiry(redis):
    now = int(time.time())
    assert not token_store.is_access_token_revoked("jti-1", 7, now)

    token_store.revoke_access_token("jti-1", now + 600)

    assert token_store.is_access_token_revoked("jti-1", 7, now)
    assert not token_store.is_access_token_revoked("jti-2", 7, now)


def test_revoke_all_rejects_only_tokens_issued_before(redis):
    token_store.revoke_all_access_tokens(7)
    revoked_at = int(redis.get("revoked_before:7"))

    assert token_store.is_access_token_revoked("old", 7, revoked_at - 60)
    assert not token_store.is_access_token_revoked("new", 7, revoked_at + 1)
    assert not token_store.is_access_token_revoked("other-user", 8, revoked_at - 60)


def test_ws_ticket_works_exactly_once(redis):
    ticket = token_store.issue_ws_ticket(42)

    assert token_store.consume_ws_ticket(ticket) == 42
    assert token_store.consume_ws_ticket(ticket) is None
    assert token_store.consume_ws_ticket("forged") is None


def test_token_store_fails_closed_when_redis_is_down(monkeypatch):
    from redis.exceptions import ConnectionError

    class DownRedis(FakeRedis):
        def pipeline(self):
            raise ConnectionError("down")

    monkeypatch.setattr(token_store, "_client", lambda: DownRedis())

    with pytest.raises(HTTPException) as exc:
        token_store.is_access_token_revoked("jti", 1, 0)
    assert exc.value.status_code == 503


def test_csrf_token_is_bound_to_the_refresh_token():
    token = csrf.generate_csrf_token("refresh-A")

    csrf.verify_csrf_token(token, token, "refresh-A")

    # Same token pair planted into another session (cookie tossing) fails.
    with pytest.raises(HTTPException) as exc:
        csrf.verify_csrf_token(token, token, "refresh-B")
    assert exc.value.status_code == 403


def test_unsigned_or_mismatched_csrf_tokens_are_rejected():
    token = csrf.generate_csrf_token("refresh-A")

    for cookie, header in [("plain-random", "plain-random"), (token, token + "x"), (None, token)]:
        with pytest.raises(HTTPException):
            csrf.verify_csrf_token(cookie, header, "refresh-A")


def test_csrf_is_not_required_without_a_refresh_cookie():
    # Nothing to protect: refresh fails with 401 and logout only clears cookies.
    csrf.verify_csrf_token(None, None, None)

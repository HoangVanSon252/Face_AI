"""Redis-backed revocation for stateless JWT access tokens and one-time WebSocket tickets.

- blacklist:{jti}         set on logout until the token would have expired anyway
- revoked_before:{user}   unix time; every access token issued earlier is rejected
                          (account locked, password reset, refresh-token reuse)
- ws_ticket:{ticket}      30s single-use ticket so the JWT never appears in WS URLs

Fails closed: if Redis cannot answer, authentication is refused (503) rather
than accepting a token that may have been revoked.
"""
import logging
import secrets
import time

from fastapi import HTTPException, status
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger("face_attendance")

WS_TICKET_TTL_SECONDS = 30
# Upper bound for revoked_before keys: no access token outlives this.
_REVOKE_ALL_TTL_SECONDS = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 + 60

_redis: Redis | None = None


def _client() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _redis


def _unavailable(exc: Exception) -> HTTPException:
    logger.error("token_store_unavailable", exc_info=exc)
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication store is unavailable")


def revoke_access_token(jti: str, expires_at: int) -> None:
    ttl = int(expires_at - time.time())
    if ttl <= 0:
        return
    try:
        _client().set(f"blacklist:{jti}", "1", ex=ttl)
    except RedisError as exc:
        raise _unavailable(exc) from exc


def revoke_all_access_tokens(user_id: int) -> None:
    try:
        _client().set(f"revoked_before:{user_id}", int(time.time()), ex=_REVOKE_ALL_TTL_SECONDS)
    except RedisError as exc:
        raise _unavailable(exc) from exc


def is_access_token_revoked(jti: str, user_id: int, issued_at: int) -> bool:
    try:
        blacklisted, revoked_before = _client().pipeline().exists(f"blacklist:{jti}").get(f"revoked_before:{user_id}").execute()
    except RedisError as exc:
        raise _unavailable(exc) from exc
    # iat has one-second resolution: a token issued in the same second as the
    # revocation is treated as revoked too.
    return bool(blacklisted) or (revoked_before is not None and issued_at <= int(revoked_before))


def issue_ws_ticket(user_id: int) -> str:
    ticket = secrets.token_urlsafe(32)
    try:
        _client().set(f"ws_ticket:{ticket}", user_id, ex=WS_TICKET_TTL_SECONDS)
    except RedisError as exc:
        raise _unavailable(exc) from exc
    return ticket


def consume_ws_ticket(ticket: str) -> int | None:
    """Atomically read and delete a ticket; a ticket works exactly once."""
    try:
        value = _client().getdel(f"ws_ticket:{ticket}")
    except RedisError:
        logger.warning("ws_ticket_store_unavailable")
        return None
    return int(value) if value is not None else None


# Brute-force protection per account. The per-IP limit cannot do this alone:
# a whole campus shares one NAT address, so it must stay generous.
def _login_key(username: str) -> str:
    return f"login_fail:{username.strip().lower()}"


def login_locked(username: str) -> bool:
    try:
        failures = _client().get(_login_key(username))
    except RedisError as exc:
        raise _unavailable(exc) from exc
    return failures is not None and int(failures) >= settings.LOGIN_MAX_FAILURES


def record_login_failure(username: str) -> None:
    try:
        key = _login_key(username)
        failures = _client().incr(key)
        if failures == 1:
            _client().expire(key, settings.LOGIN_LOCKOUT_MINUTES * 60)
    except RedisError as exc:
        raise _unavailable(exc) from exc


def clear_login_failures(username: str) -> None:
    try:
        _client().delete(_login_key(username))
    except RedisError as exc:
        raise _unavailable(exc) from exc

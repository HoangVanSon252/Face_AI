import hashlib

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def user_key(request: Request) -> str:
    """Per-credential bucket, so users behind one NAT/proxy do not share a limit."""
    authorization = request.headers.get("authorization", "")
    if authorization:
        return "auth:" + hashlib.sha256(authorization.encode()).hexdigest()[:32]
    return get_remote_address(request)


def session_key(request: Request) -> str:
    """Per attendance session: caps a misbehaving kiosk without affecting other classes."""
    return f"session:{request.path_params.get('session_id')}"


# Redis keeps rate limits consistent across application instances and restarts.
# The client IP comes from uvicorn --proxy-headers (X-Forwarded-For set by Nginx).
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
)

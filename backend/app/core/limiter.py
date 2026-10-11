from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


# Redis keeps rate limits consistent across application instances and restarts.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
)

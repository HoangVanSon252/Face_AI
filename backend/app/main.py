from contextlib import asynccontextmanager

from app.database import Base, engine
from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.middleware import setup_middlewares
from app.core.limiter import limiter
from app.api.v1.api import api_router
from app.core.exceptions import setup_exception_handler
from app.core.logging import setup_logging
from app.services.realtime import realtime_service

setup_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await realtime_service.start()
    try:
        yield
    finally:
        await realtime_service.stop()
        engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Gắn Rate Limiter vào app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Kích hoạt toàn bộ middlewares
setup_middlewares(app)

# Kích hoạt Global Exception Handler
setup_exception_handler(app)

# Tích hợp toàn bộ router (gom từ thư mục endpoints)
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {"message": "Welcome to Face Attendance API"}

@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
def ready() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    try:
        from redis import Redis
        Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1, socket_timeout=1).ping()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Redis is not ready") from exc
    return {"status": "ready"}

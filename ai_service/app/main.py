from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints.face import router as face_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
)

# AI service chỉ nhận request nội bộ từ Backend khi deploy production.
# Local cho phép frontend/backend để tiện kiểm tra.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(face_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
def preload_models():
    """Pre-warm InsightFace models so the first API request is served immediately."""
    from app.engine.recognizer import get_face_app
    get_face_app()


@app.get("/health", tags=["health"])
def health():
    liveness_configured = bool(
        settings.liveness_model_file
        and settings.liveness_model_file.is_file()
    )
    body = {
        "status": "ok",
        "service": "ai-service",
        "liveness_configured": liveness_configured,
    }
    # Fail closed: outside local development a missing anti-spoofing model
    # must keep the service unhealthy instead of silently accepting photos.
    if not liveness_configured and not settings.liveness_fallback_allowed:
        body["status"] = "liveness_model_missing"
        return JSONResponse(status_code=503, content=body)
    return body

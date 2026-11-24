from threading import BoundedSemaphore
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

_client: httpx.Client | None = None
# Backpressure: cap concurrent AI calls per worker. When the AI is saturated a
# frame is rejected after a short wait (503 + Retry-After) instead of queueing
# for the full timeout; the kiosk simply sends its next frame.
_inflight = BoundedSemaphore(settings.AI_MAX_INFLIGHT_PER_WORKER)


def get_client() -> httpx.Client:
    """One pooled client per worker: reuses keep-alive connections to ai_service."""
    global _client
    if _client is None:
        _client = httpx.Client(
            base_url=settings.AI_SERVICE_URL.rstrip("/"),
            timeout=settings.AI_SERVICE_TIMEOUT_SECONDS,
            limits=httpx.Limits(max_connections=64, max_keepalive_connections=32),
        )
    return _client


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def _post(path: str, image_base64: str, failure_detail: str, timeout: float | None = None) -> dict[str, Any]:
    if not _inflight.acquire(timeout=settings.AI_QUEUE_WAIT_SECONDS):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is busy",
            headers={"Retry-After": "1"},
        )
    try:
        kwargs = {"timeout": timeout} if timeout is not None else {}
        response = get_client().post(path, json={"image_base64": image_base64}, **kwargs)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI service is unavailable") from exc
    finally:
        _inflight.release()
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", failure_detail)
        except Exception:
            detail = response.text or failure_detail
        raise HTTPException(status_code=response.status_code, detail=detail)
    return response.json()


def analyze_face(image_base64: str) -> dict[str, Any]:
    """Embedding + liveness of the single face in one AI round-trip (one detection pass)."""
    return _post("/api/v1/face/analyze", image_base64, "AI processing failed")


def extract_embedding(image_base64: str) -> dict[str, Any]:
    return _post("/api/v1/face/embedding", image_base64, "AI processing failed")


def check_liveness(image_base64: str) -> dict[str, Any]:
    """Ask the isolated AI service to verify anti-spoofing for one webcam frame."""
    return _post("/api/v1/face/liveness", image_base64, "Liveness processing failed")


def detect_faces_fast(image_base64: str) -> dict[str, Any]:
    """Fast face detector query for live webcam frame alignment check."""
    try:
        return _post("/api/v1/face/detect", image_base64, "Detection failed", timeout=8.0)
    except HTTPException:
        return {"face_count": 0, "faces": []}

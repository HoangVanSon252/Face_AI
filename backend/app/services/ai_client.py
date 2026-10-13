from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


def extract_embedding(image_base64: str) -> dict[str, Any]:
    try:
        with httpx.Client(timeout=settings.AI_SERVICE_TIMEOUT_SECONDS) as client:
            response = client.post(
                f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/face/embedding",
                json={"image_base64": image_base64},
            )
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", "AI processing failed")
            except Exception:
                detail = response.text or "AI processing failed"
            raise HTTPException(status_code=response.status_code, detail=detail)
        return response.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI service is unavailable") from exc


def check_liveness(image_base64: str) -> dict[str, Any]:
    """Ask the isolated AI service to verify anti-spoofing for one webcam frame."""
    try:
        with httpx.Client(timeout=settings.AI_SERVICE_TIMEOUT_SECONDS) as client:
            response = client.post(
                f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/face/liveness",
                json={"image_base64": image_base64},
            )
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", "Liveness processing failed")
            except Exception:
                detail = response.text or "Liveness processing failed"
            raise HTTPException(status_code=response.status_code, detail=detail)
        return response.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI service is unavailable") from exc

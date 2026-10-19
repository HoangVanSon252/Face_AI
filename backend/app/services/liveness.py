from typing import Any

from app.services.ai_client import check_liveness


def verify_liveness(image_base64: str) -> dict[str, Any]:
    """Compatibility boundary: ONNX inference stays isolated in ai_service."""
    return check_liveness(image_base64)

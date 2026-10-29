import base64

import cv2
import numpy as np
from fastapi import HTTPException, status

from app.core.config import settings


def decode_base64_image(value: str) -> np.ndarray:
    """Decode JPEG/PNG Base64 to OpenCV BGR image."""
    try:
        encoded = value.split(",", 1)[1] if "," in value else value
        raw = base64.b64decode(encoded, validate=True)
        image = cv2.imdecode(np.frombuffer(
            raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="image_base64 is not a valid JPEG/PNG Base64 image",
        ) from exc

    if image is None or image.size == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to decode image",
        )

    height, width = image.shape[:2]
    if width < 80 or height < 80:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image must be at least 80x80 pixels",
        )

    # Webcam frames rarely need more than ~1280px; larger uploads only cost CPU.
    longest = max(height, width)
    if longest > settings.MAX_IMAGE_SIDE:
        scale = settings.MAX_IMAGE_SIDE / longest
        image = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)

    return image

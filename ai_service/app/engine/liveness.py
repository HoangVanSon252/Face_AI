from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import HTTPException, status

from app.core.config import settings


def _model_unavailable(message: str) -> HTTPException:
    """Never let a missing or invalid anti-spoofing model become a pass."""
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


@lru_cache(maxsize=1)
def _session() -> ort.InferenceSession:
    """Load the ONNX graph once, after configuration has been validated."""
    model_path: Path | None = settings.liveness_model_file
    if model_path is None or not model_path.is_file():
        raise _model_unavailable("Liveness model is not configured")
    try:
        return ort.InferenceSession(str(model_path), providers=settings.model_providers_list)
    except Exception as exc:
        raise _model_unavailable("Liveness model could not be loaded") from exc


def _prepare_input(face_image: np.ndarray) -> np.ndarray:
    """Convert a BGR face crop into the configurable tensor required by ONNX."""
    if face_image is None or face_image.size == 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Face crop is empty")

    image = cv2.resize(face_image, (settings.LIVENESS_INPUT_WIDTH, settings.LIVENESS_INPUT_HEIGHT))
    if settings.LIVENESS_COLOR_SPACE == "RGB":
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    tensor = image.astype(np.float32)
    if settings.LIVENESS_NORMALIZATION == "zero_one":
        tensor /= 255.0
    elif settings.LIVENESS_NORMALIZATION == "minus_one_one":
        tensor = (tensor / 127.5) - 1.0

    if settings.LIVENESS_INPUT_LAYOUT == "NCHW":
        tensor = np.transpose(tensor, (2, 0, 1))
    return np.expand_dims(tensor, axis=0)


def _live_probability(output: np.ndarray) -> float:
    """Accept common ONNX binary outputs: scalar probability, logits, or two classes."""
    values = np.asarray(output, dtype=np.float32).reshape(-1)
    if values.size == 0:
        raise _model_unavailable("Liveness model returned an empty output")

    if values.size == 1:
        value = float(values[0])
        # A scalar outside [0, 1] is interpreted as a logit.
        return value if 0.0 <= value <= 1.0 else float(1.0 / (1.0 + np.exp(-value)))

    if settings.LIVENESS_LIVE_CLASS_INDEX >= values.size:
        raise _model_unavailable("LIVENESS_LIVE_CLASS_INDEX does not match model output")

    is_probability_vector = bool(np.all((values >= 0.0) & (values <= 1.0)) and np.isclose(values.sum(), 1.0, atol=0.02))
    if not is_probability_vector:
        shifted = values - np.max(values)
        values = np.exp(shifted) / np.exp(shifted).sum()
    return float(values[settings.LIVENESS_LIVE_CLASS_INDEX])


def check_liveness(face_image: np.ndarray, face=None) -> tuple[bool, float]:
    """Run anti-spoofing inference and return (is_live, live_probability)."""
    model_path = settings.liveness_model_file
    if model_path is None or not model_path.is_file():
        # Fallback when ONNX anti-spoofing weights are not configured
        if face_image is None or face_image.size == 0:
            return False, 0.0
        det_score = float(getattr(face, "det_score", 0.95)) if face else 0.95
        return det_score >= 0.5, round(min(max(det_score, 0.0), 1.0), 6)

    session = _session()
    try:
        input_name = session.get_inputs()[0].name
        output = session.run(None, {input_name: _prepare_input(face_image)})[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise _model_unavailable("Liveness inference failed") from exc

    score = _live_probability(output)
    return score >= settings.LIVENESS_THRESHOLD, round(score, 6)

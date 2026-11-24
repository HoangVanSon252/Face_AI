from functools import lru_cache

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import HTTPException, status

from app.core.config import LivenessModelSpec, settings
from app.engine.onnx_options import session_options


def _model_unavailable(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


@lru_cache(maxsize=8)
def _session(path: str) -> ort.InferenceSession:
    try:
        return ort.InferenceSession(
            path,
            sess_options=session_options(),
            providers=settings.model_providers_list,
        )
    except Exception as exc:
        raise _model_unavailable("Liveness model could not be loaded") from exc


def _margin_crop(image: np.ndarray, bbox) -> np.ndarray:
    """Detected face plus a 15% margin (legacy single-model configuration)."""
    height, width = image.shape[:2]
    x1, y1, x2, y2 = (float(value) for value in bbox)
    margin_x = (x2 - x1) * 0.15
    margin_y = (y2 - y1) * 0.15
    left, top = max(0, int(x1 - margin_x)), max(0, int(y1 - margin_y))
    right, bottom = min(width, int(x2 + margin_x)), min(height, int(y2 + margin_y))
    return image[top:bottom, left:right]


def _scaled_crop(image: np.ndarray, bbox, scale: float) -> np.ndarray:
    """Port of Silent-Face-Anti-Spoofing CropImage: the bbox enlarged `scale`
    times around its centre, shifted (not clipped) to stay inside the frame.
    MiniFASNet was trained on these context patches, so the crop must match."""
    src_h, src_w = image.shape[:2]
    x1, y1, x2, y2 = (float(value) for value in bbox)
    box_w, box_h = max(x2 - x1, 1.0), max(y2 - y1, 1.0)
    scale = min((src_h - 1) / box_h, (src_w - 1) / box_w, scale)
    new_w, new_h = box_w * scale, box_h * scale
    center_x, center_y = x1 + box_w / 2, y1 + box_h / 2
    left, top = center_x - new_w / 2, center_y - new_h / 2
    right, bottom = center_x + new_w / 2, center_y + new_h / 2
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > src_w - 1:
        left -= right - src_w + 1
        right = src_w - 1
    if bottom > src_h - 1:
        top -= bottom - src_h + 1
        bottom = src_h - 1
    return image[int(top): int(bottom) + 1, int(left): int(right) + 1]


def _prepare_input(face_image: np.ndarray) -> np.ndarray:
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


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    return np.exp(shifted) / np.exp(shifted).sum()


def _live_probability(output: np.ndarray) -> float:
    values = np.asarray(output, dtype=np.float32).reshape(-1)
    if values.size == 0:
        raise _model_unavailable("Liveness model returned an empty output")
    if values.size == 1:
        value = float(values[0])
        if settings.LIVENESS_OUTPUT_TYPE == "probabilities" or (
            settings.LIVENESS_OUTPUT_TYPE == "auto" and 0.0 <= value <= 1.0
        ):
            return value
        return float(1.0 / (1.0 + np.exp(-value)))
    if settings.LIVENESS_LIVE_CLASS_INDEX >= values.size:
        raise _model_unavailable("LIVENESS_LIVE_CLASS_INDEX does not match model output")
    if settings.LIVENESS_OUTPUT_TYPE == "logits":
        values = _softmax(values)
    elif settings.LIVENESS_OUTPUT_TYPE == "auto":
        is_probability = bool(np.all((values >= 0.0) & (values <= 1.0)) and np.isclose(values.sum(), 1.0, atol=0.02))
        if not is_probability:
            values = _softmax(values)
    return float(values[settings.LIVENESS_LIVE_CLASS_INDEX])


def _model_score(image: np.ndarray, bbox, spec: LivenessModelSpec) -> float:
    crop = _margin_crop(image, bbox) if spec.crop_scale is None else _scaled_crop(image, bbox, spec.crop_scale)
    session = _session(str(spec.path))
    input_name = session.get_inputs()[0].name
    return _live_probability(session.run(None, {input_name: _prepare_input(crop)})[0])


def models_configured() -> bool:
    specs = settings.liveness_models
    return bool(specs) and all(spec.path.is_file() for spec in specs)


def check_liveness(image: np.ndarray, face) -> tuple[bool, float]:
    """Average live probability over the configured models for one detected face."""
    if not models_configured():
        if settings.liveness_fallback_allowed:
            score = float(getattr(face, "det_score", 0.0) or 0.0)
            return score >= 0.65, round(max(0.0, min(score, 1.0)), 6)
        raise _model_unavailable("Liveness model is not configured")
    try:
        scores = [_model_score(image, face.bbox, spec) for spec in settings.liveness_models]
    except HTTPException:
        raise
    except Exception as exc:
        raise _model_unavailable("Liveness inference failed") from exc
    score = float(np.mean(scores))
    return score >= settings.LIVENESS_THRESHOLD, round(score, 6)

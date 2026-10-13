from functools import lru_cache

import numpy as np
from insightface.app import FaceAnalysis

from app.core.config import settings


@lru_cache(maxsize=1)
def get_face_app() -> FaceAnalysis:
    app = FaceAnalysis(name="buffalo_l", providers=settings.model_providers_list)
    app.prepare(ctx_id=-1, det_size=(settings.DETECTION_SIZE, settings.DETECTION_SIZE))
    return app


def detect_faces(image: np.ndarray):
    return get_face_app().get(image)


def estimate_quality(face, image: np.ndarray) -> float:
    """Quality for enrollment/review only; never use as a liveness score."""
    x1, y1, x2, y2 = (float(value) for value in face.bbox)
    face_area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    image_area = image.shape[0] * image.shape[1]
    size_score = min(face_area / max(image_area * 0.12, 1), 1.0)
    return round((float(face.det_score) * 0.7) + (size_score * 0.3), 4)

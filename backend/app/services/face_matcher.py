"""Section-scoped face matching.

Only students enrolled in the session's section are candidates, which keeps the
search space at one class (~200-300 vectors) instead of the whole school and
prevents matching a student from another class. Each worker caches the
L2-normalised matrix per section, keyed by a cheap signature of the section's
active profiles, so a new enrollment or revocation invalidates it on any worker.
"""
from dataclasses import dataclass
from threading import Lock

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.biometric_crypto import decrypt_embedding
from app.models.course import Enrollment, EnrollmentStatusEnum
from app.models.face import FaceEmbedding, FaceProfile, FaceProfileStatusEnum

_MAX_CACHED_SECTIONS = 256


@dataclass(frozen=True)
class SectionMatrix:
    signature: tuple
    matrix: np.ndarray  # (N, D), rows L2-normalised
    student_ids: np.ndarray  # (N,)


_cache: dict[int, SectionMatrix] = {}
_lock = Lock()


def _active_profiles(db: Session, section_id: int):
    return (
        db.query(FaceProfile)
        .join(Enrollment, Enrollment.student_id == FaceProfile.student_id)
        .filter(
            Enrollment.section_id == section_id,
            Enrollment.status == EnrollmentStatusEnum.ENROLLED,
            FaceProfile.status == FaceProfileStatusEnum.ACTIVE,
        )
    )


def _signature(db: Session, section_id: int) -> tuple:
    count, max_id, max_updated = _active_profiles(db, section_id).with_entities(
        func.count(FaceProfile.id), func.max(FaceProfile.id), func.max(FaceProfile.updated_at)
    ).one()
    return (int(count or 0), int(max_id or 0), str(max_updated))


def _normalise(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=-1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


def _load(db: Session, section_id: int, signature: tuple, dimension: int) -> SectionMatrix:
    rows = (
        _active_profiles(db, section_id)
        .join(FaceEmbedding, FaceEmbedding.face_profile_id == FaceProfile.id)
        .with_entities(FaceEmbedding.embedding_data, FaceProfile.student_id)
        .all()
    )
    # Decrypt only when the section's profiles change (cache miss), not per frame.
    decoded = ((decrypt_embedding(data), student_id) for data, student_id in rows)
    vectors = [(data, student_id) for data, student_id in decoded if len(data) == dimension]
    if not vectors:
        matrix = np.empty((0, dimension), dtype=np.float32)
        student_ids = np.empty((0,), dtype=np.int64)
    else:
        matrix = _normalise(np.asarray([data for data, _ in vectors], dtype=np.float32))
        student_ids = np.asarray([student_id for _, student_id in vectors], dtype=np.int64)
    return SectionMatrix(signature=signature, matrix=matrix, student_ids=student_ids)


def section_matrix(db: Session, section_id: int, dimension: int) -> SectionMatrix:
    signature = _signature(db, section_id) + (dimension,)
    cached = _cache.get(section_id)
    if cached is not None and cached.signature == signature:
        return cached
    loaded = _load(db, section_id, signature, dimension)
    with _lock:
        if len(_cache) >= _MAX_CACHED_SECTIONS and section_id not in _cache:
            _cache.pop(next(iter(_cache)))
        _cache[section_id] = loaded
    return loaded


def best_match(db: Session, section_id: int, embedding: list[float]) -> tuple[float, int] | None:
    """Return (cosine similarity, student_id) of the closest enrolled student, or None."""
    query = np.asarray(embedding, dtype=np.float32)
    if query.ndim != 1 or query.size == 0:
        return None
    candidates = section_matrix(db, section_id, query.size)
    if candidates.matrix.shape[0] == 0:
        return None
    scores = candidates.matrix @ _normalise(query)
    index = int(np.argmax(scores))
    return float(scores[index]), int(candidates.student_ids[index])


def clear_cache() -> None:
    with _lock:
        _cache.clear()

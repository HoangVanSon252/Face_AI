from datetime import datetime

from sqlalchemy.orm import Session

from app.models.face import FaceEmbedding, FaceProfile, FaceProfileStatusEnum


def active_profile(db: Session, student_id: int) -> FaceProfile | None:
    return db.query(FaceProfile).filter(FaceProfile.student_id == student_id, FaceProfile.status == FaceProfileStatusEnum.ACTIVE).first()


def create_profile(db: Session, student_id: int, enrolled_by: int, dimension: int) -> FaceProfile:
    profile = FaceProfile(student_id=student_id, model_name="InsightFace buffalo_l", model_version="1", embedding_dimension=dimension, status=FaceProfileStatusEnum.PENDING, consent_at=datetime.utcnow(), enrolled_by=enrolled_by)
    db.add(profile)
    db.flush()
    return profile


def add_embedding(db: Session, profile_id: int, embedding: list[float], quality_score: float, is_primary: bool) -> FaceEmbedding:
    row = FaceEmbedding(face_profile_id=profile_id, embedding_data=embedding, quality_score=quality_score, is_primary=is_primary)
    db.add(row)
    return row

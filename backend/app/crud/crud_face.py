from datetime import datetime

from sqlalchemy.orm import Session

from app.core.biometric_crypto import encrypt_embedding
from app.models.face import BiometricConsent, FaceEmbedding, FaceProfile, FaceProfileStatusEnum


def active_profile(db: Session, student_id: int) -> FaceProfile | None:
    return db.query(FaceProfile).filter(FaceProfile.student_id == student_id, FaceProfile.status == FaceProfileStatusEnum.ACTIVE).first()


def create_profile(db: Session, student_id: int, enrolled_by: int, dimension: int) -> FaceProfile:
    profile = FaceProfile(student_id=student_id, model_name="InsightFace buffalo_l", model_version="1", embedding_dimension=dimension, status=FaceProfileStatusEnum.PENDING, consent_at=datetime.utcnow(), enrolled_by=enrolled_by)
    db.add(profile)
    db.flush()
    return profile


def add_embedding(db: Session, profile_id: int, embedding: list[float], quality_score: float, is_primary: bool) -> FaceEmbedding:
    row = FaceEmbedding(face_profile_id=profile_id, embedding_data=encrypt_embedding(embedding), quality_score=quality_score, is_primary=is_primary)
    db.add(row)
    return row


def record_consent(db: Session, student_id: int, granted_by: int, policy_version: str, ip_address: str | None, user_agent: str | None) -> BiometricConsent:
    consent = BiometricConsent(
        student_id=student_id,
        policy_version=policy_version,
        granted_by=granted_by,
        granted_at=datetime.utcnow(),
        ip_address=ip_address,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(consent)
    return consent


def erase_face_data(db: Session, student_id: int, *, revoke_consent: bool) -> int:
    """Delete every stored embedding of the student and revoke their profiles.
    Returns the number of embeddings erased. Profiles stay as REVOKED rows (no
    biometric data) so the audit trail of when a profile existed is kept."""
    now = datetime.utcnow()
    profile_ids = [row.id for row in db.query(FaceProfile.id).filter(FaceProfile.student_id == student_id)]
    erased = 0
    if profile_ids:
        erased = db.query(FaceEmbedding).filter(FaceEmbedding.face_profile_id.in_(profile_ids)).delete(synchronize_session=False)
        db.query(FaceProfile).filter(
            FaceProfile.id.in_(profile_ids), FaceProfile.status != FaceProfileStatusEnum.REVOKED
        ).update({"status": FaceProfileStatusEnum.REVOKED, "revoked_at": now}, synchronize_session=False)
    if revoke_consent:
        db.query(BiometricConsent).filter(
            BiometricConsent.student_id == student_id, BiometricConsent.revoked_at.is_(None)
        ).update({"revoked_at": now}, synchronize_session=False)
    return erased

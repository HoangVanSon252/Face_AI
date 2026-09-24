import enum
from sqlalchemy import Column, BigInteger, String, DateTime, Enum, ForeignKey, JSON, CheckConstraint, Boolean, SmallInteger, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class FaceProfileStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"

class FaceProfile(Base):
    __tablename__ = "face_profiles"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    student_id = Column(BigInteger, ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False, index=True)
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(50), nullable=False)
    embedding_dimension = Column(SmallInteger, nullable=False)
    status = Column(Enum(FaceProfileStatusEnum), nullable=False, default=FaceProfileStatusEnum.PENDING, index=True)
    
    consent_at = Column(DateTime, nullable=False)
    enrolled_by = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    activated_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    # Liên kết với Student bên user.py
    student = relationship("Student", back_populates="face_profiles", primaryjoin="FaceProfile.student_id == Student.user_id")
    enrolled_by_user = relationship("User", primaryjoin="FaceProfile.enrolled_by == User.id")
    embeddings = relationship("FaceEmbedding", back_populates="profile", cascade="all, delete-orphan")

class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    face_profile_id = Column(BigInteger, ForeignKey("face_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding_data = Column(JSON, nullable=False) # Lưu vector dưới dạng array trong JSON
    quality_score = Column(Numeric(5, 4), nullable=False) # Lấy 4 chữ số thập phân
    image_uri = Column(String(500), nullable=True)
    image_checksum = Column(String(64), nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False, index=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())

    __table_args__ = (
        CheckConstraint('quality_score BETWEEN 0 AND 1', name='ck_embeddings_quality'),
    )

    profile = relationship("FaceProfile", back_populates="embeddings")

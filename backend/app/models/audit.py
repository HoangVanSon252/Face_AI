from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    actor_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(80), nullable=True)
    entity_id = Column(String(80), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    details = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())

    __table_args__ = (
        Index('idx_audit_actor_time', 'actor_user_id', 'created_at'),
        Index('idx_audit_entity', 'entity_type', 'entity_id'),
        Index('idx_audit_action_time', 'action', 'created_at'),
    )

    actor = relationship("User", back_populates="audit_logs")

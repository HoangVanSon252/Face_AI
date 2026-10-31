from sqlalchemy import Boolean, Column, BigInteger, String, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from app.database import Base


class Notification(Base):
    """A business event addressed to one user (shown in the bell, pushed over WebSocket)."""
    __tablename__ = "notifications"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(String(500), nullable=True)
    link = Column(String(200), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, nullable=False, default=func.now())

    __table_args__ = (
        Index('idx_notifications_user_time', 'user_id', 'created_at'),
    )

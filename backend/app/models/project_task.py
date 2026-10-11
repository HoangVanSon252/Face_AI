import enum

from sqlalchemy import Column, BigInteger, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.sql import func

from app.database import Base


class ProjectTaskStatusEnum(str, enum.Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    DONE = "DONE"


class ProjectTaskPriorityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ProjectTaskStatusEnum), nullable=False, default=ProjectTaskStatusEnum.TODO)
    priority = Column(Enum(ProjectTaskPriorityEnum), nullable=False, default=ProjectTaskPriorityEnum.MEDIUM)
    assignee_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

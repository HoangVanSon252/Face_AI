from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from app.models.project_task import ProjectTaskPriorityEnum, ProjectTaskStatusEnum


class ProjectTaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    priority: ProjectTaskPriorityEnum = ProjectTaskPriorityEnum.MEDIUM
    assignee_user_id: int | None = None
    due_date: datetime | None = None


class ProjectTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: ProjectTaskStatusEnum | None = None
    priority: ProjectTaskPriorityEnum | None = None
    assignee_user_id: int | None = None
    due_date: datetime | None = None


class ProjectTaskResponse(ProjectTaskCreate):
    id: int
    status: ProjectTaskStatusEnum
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

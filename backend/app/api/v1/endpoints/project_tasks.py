from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api import dependencies
from app.models.project_task import ProjectTask
from app.models.user import RoleEnum
from app.schemas.project_task import ProjectTaskCreate, ProjectTaskResponse, ProjectTaskUpdate
from app.services.audit_service import write_audit_log

router = APIRouter()
require_admin = dependencies.require_role([RoleEnum.ADMIN.value])


@router.get("/project-tasks", response_model=list[ProjectTaskResponse])
def list_project_tasks(db: Session = Depends(dependencies.get_db), _=Depends(require_admin)):
    return db.query(ProjectTask).order_by(ProjectTask.updated_at.desc()).all()


@router.post("/project-tasks", response_model=ProjectTaskResponse, status_code=status.HTTP_201_CREATED)
def create_project_task(data: ProjectTaskCreate, request: Request, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    task = ProjectTask(**data.model_dump(), created_by_user_id=current_user.id)
    db.add(task)
    db.flush()
    write_audit_log(db, action="PROJECT_TASK_CREATED", actor_user_id=current_user.id, entity_type="PROJECT_TASK", entity_id=task.id, request=request, details={"title": task.title}, commit=False)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/project-tasks/{task_id}", response_model=ProjectTaskResponse)
def update_project_task(task_id: int, data: ProjectTaskUpdate, request: Request, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    task = db.get(ProjectTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Project task not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    write_audit_log(db, action="PROJECT_TASK_UPDATED", actor_user_id=current_user.id, entity_type="PROJECT_TASK", entity_id=task.id, request=request, details={"title": task.title}, commit=False)
    db.commit()
    db.refresh(task)
    return task

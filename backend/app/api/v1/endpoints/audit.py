from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import dependencies
from app.models.audit import AuditLog
from app.models.user import RoleEnum
from app.schemas.audit import AuditLogResponse

router = APIRouter()


@router.get("/audit-logs", response_model=list[AuditLogResponse])
def list_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(dependencies.get_db),
    _=Depends(dependencies.require_role([RoleEnum.ADMIN.value])),
):
    return (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

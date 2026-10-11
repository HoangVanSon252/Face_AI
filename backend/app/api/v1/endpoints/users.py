from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_active_user, get_db, require_role
from app.core.security import get_password_hash
from app.crud.crud_user import revoke_all_user_tokens
from app.models.user import RoleEnum, User, UserStatusEnum
from app.schemas.user import AdminPasswordReset, AdminUserResponse, AdminUserUpdate, UserCreate, UserResponse
from app.services.audit_service import write_audit_log
from app.services.user_service import UserService

router = APIRouter()
require_admin = Depends(require_role([RoleEnum.ADMIN.value]))


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = (
        db.query(User)
        .options(joinedload(User.student_profile), joinedload(User.lecturer_profile))
        .filter(User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _ensure_last_admin_is_protected(db: Session, target: User, new_role: RoleEnum, new_status: UserStatusEnum) -> None:
    removing_active_admin = target.role == RoleEnum.ADMIN and target.status == UserStatusEnum.ACTIVE and (
        new_role != RoleEnum.ADMIN or new_status != UserStatusEnum.ACTIVE
    )
    if removing_active_admin:
        active_admin_count = db.query(User).filter(User.role == RoleEnum.ADMIN, User.status == UserStatusEnum.ACTIVE).count()
        if active_admin_count <= 1:
            raise HTTPException(status_code=409, detail="Cannot remove or lock the last active admin")


@router.get("/", response_model=list[AdminUserResponse], dependencies=[require_admin])
def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    query: str | None = Query(default=None, max_length=100),
    role: RoleEnum | None = None,
    account_status: UserStatusEnum | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    statement = db.query(User).options(joinedload(User.student_profile), joinedload(User.lecturer_profile))
    if query:
        pattern = f"%{query.strip()}%"
        statement = statement.filter(or_(User.username.ilike(pattern), User.email.ilike(pattern), User.full_name.ilike(pattern)))
    if role:
        statement = statement.filter(User.role == role)
    if account_status:
        statement = statement.filter(User.status == account_status)
    return statement.order_by(User.created_at.desc(), User.id.desc()).offset(skip).limit(limit).all()


@router.post(
    "/", response_model=UserResponse, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role([RoleEnum.ADMIN.value]))],
)
def create_user(
    user_in: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = require_admin,
):
    created_user = UserService.create_user(db=db, user_in=user_in)
    write_audit_log(
        db,
        action="ADMIN_USER_CREATED",
        actor_user_id=current_user.id,
        entity_type="USER",
        entity_id=created_user.id,
        request=request,
        details={"role": created_user.role.value, "username": created_user.username},
        commit=True,
    )
    return created_user


@router.patch("/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = require_admin,
):
    target = _get_user_or_404(db, user_id)
    if target.id == current_user.id and (data.status not in (None, UserStatusEnum.ACTIVE) or (data.role is not None and data.role != RoleEnum.ADMIN)):
        raise HTTPException(status_code=400, detail="Admin cannot lock or demote their own account")

    new_role = data.role or target.role
    new_status = data.status or target.status
    _ensure_last_admin_is_protected(db, target, new_role, new_status)
    if data.role == RoleEnum.STUDENT and target.student_profile is None:
        raise HTTPException(status_code=422, detail="A student role requires a student profile")
    if data.role == RoleEnum.LECTURER and target.lecturer_profile is None:
        raise HTTPException(status_code=422, detail="A lecturer role requires a lecturer profile")
    if data.email and data.email != target.email and db.query(User.id).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="Email already exists")

    before = {"role": target.role.value, "status": target.status.value, "email": target.email, "full_name": target.full_name}
    changes = data.model_dump(exclude_unset=True)
    department = changes.pop("department", None)
    for field, value in changes.items():
        setattr(target, field, value)
    if department is not None:
        if target.student_profile is not None:
            target.student_profile.major = department
        elif target.lecturer_profile is not None:
            target.lecturer_profile.department = department
    if target.status != UserStatusEnum.ACTIVE:
        revoke_all_user_tokens(db, target.id, commit=False)
    write_audit_log(db, action="ADMIN_USER_UPDATED", actor_user_id=current_user.id, entity_type="USER", entity_id=target.id, request=request, details={"before": before, "after": data.model_dump(exclude_unset=True, mode="json")}, commit=False)
    db.commit()
    db.refresh(target)
    return target


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: int,
    data: AdminPasswordReset,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = require_admin,
):
    target = _get_user_or_404(db, user_id)
    target.password_hash = get_password_hash(data.new_password)
    revoke_all_user_tokens(db, target.id, commit=False)
    write_audit_log(db, action="ADMIN_PASSWORD_RESET", actor_user_id=current_user.id, entity_type="USER", entity_id=target.id, request=request, commit=False)
    db.commit()


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != RoleEnum.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return UserService.get_user_by_id(db=db, user_id=user_id)

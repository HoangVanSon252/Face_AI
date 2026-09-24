from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_active_user, get_db, require_role
from app.models.user import RoleEnum, User
from app.schemas.user import UserCreate, UserResponse
from app.services.user_service import UserService

router = APIRouter()


@router.post(
    "/", response_model=UserResponse, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role([RoleEnum.ADMIN.value]))],
)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    return UserService.create_user(db=db, user_in=user_in)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != RoleEnum.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return UserService.get_user_by_id(db=db, user_id=user_id)
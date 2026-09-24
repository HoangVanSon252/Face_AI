from sqlalchemy.orm import Session, joinedload
from app.models.user import User, Lecturer, UserStatusEnum, RoleEnum
from app.schemas.user import UserCreate, LecturerProfileCreate
from app.core.security import get_password_hash
from app.core.exceptions import APIException
from sqlalchemy.exc import IntegrityError


def get_all_lecturers(db: Session, skip: int = 0, limit: int = 50):
    return (
        db.query(Lecturer)
        .options(joinedload(Lecturer.user))
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_lecturer_by_id(db: Session, lecturer_id: int) -> Lecturer | None:
    return (
        db.query(Lecturer)
        .options(joinedload(Lecturer.user))
        .filter(Lecturer.user_id == lecturer_id)
        .first()
    )


def create_lecturer(
    db: Session,
    user_in: UserCreate,
    profile_in: LecturerProfileCreate,
) -> Lecturer:
    try:
        db_user = User(
            username=user_in.username,
            email=user_in.email,
            full_name=user_in.full_name,
            password_hash=get_password_hash(user_in.password),
            role=RoleEnum.LECTURER,
            status=UserStatusEnum.ACTIVE,
        )
        db.add(db_user)
        db.flush()

        db_lecturer = Lecturer(
            user_id=db_user.id,
            lecturer_code=profile_in.lecturer_code,
            department=profile_in.department,
            academic_title=profile_in.academic_title,
        )
        db.add(db_lecturer)
        db.commit()
        db.refresh(db_lecturer)
        return db_lecturer
    except IntegrityError:
        db.rollback()
        raise APIException(
            status_code=409,
            code="DUPLICATE_LECTURER",
            message="Username, email hoặc mã giảng viên đã tồn tại.",
        )

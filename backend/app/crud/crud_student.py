from sqlalchemy.orm import Session, joinedload
from app.models.user import User, Student, UserStatusEnum, RoleEnum
from app.schemas.user import UserCreate, StudentProfileCreate
from app.core.security import get_password_hash
from app.core.exceptions import APIException
from sqlalchemy.exc import IntegrityError


def get_all_students(db: Session, skip: int = 0, limit: int = 50):
    return (
        db.query(Student)
        .options(joinedload(Student.user))
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_student_by_id(db: Session, student_id: int) -> Student | None:
    return (
        db.query(Student)
        .options(joinedload(Student.user))
        .filter(Student.user_id == student_id)
        .first()
    )


def get_student_by_code(db: Session, student_code: str) -> Student | None:
    return db.query(Student).filter(Student.student_code == student_code).first()


def create_student(
    db: Session,
    user_in: UserCreate,
    profile_in: StudentProfileCreate,
) -> Student:
    """Tạo User + Student profile trong 1 transaction."""
    try:
        # 1. Tạo User account
        db_user = User(
            username=user_in.username,
            email=user_in.email,
            full_name=user_in.full_name,
            password_hash=get_password_hash(user_in.password),
            role=RoleEnum.STUDENT,
            status=UserStatusEnum.ACTIVE,
        )
        db.add(db_user)
        db.flush()  # lấy db_user.id mà chưa commit

        # 2. Tạo Student profile
        db_student = Student(
            user_id=db_user.id,
            student_code=profile_in.student_code,
            date_of_birth=profile_in.date_of_birth,
            cohort=profile_in.cohort,
            major=profile_in.major,
            administrative_class=profile_in.administrative_class,
        )
        db.add(db_student)
        db.commit()
        db.refresh(db_student)
        return db_student
    except IntegrityError:
        db.rollback()
        raise APIException(
            status_code=409,
            code="DUPLICATE_STUDENT",
            message="Username, email hoặc mã sinh viên đã tồn tại.",
        )


def update_student_status(
    db: Session, student: Student, new_status: UserStatusEnum
) -> Student:
    student.user.status = new_status
    db.commit()
    db.refresh(student)
    return student

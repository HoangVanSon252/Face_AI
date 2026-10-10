from typing import Generator
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.core.config import settings
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.course import ClassSection, Enrollment, EnrollmentStatusEnum
from app.models.user import RoleEnum, User, UserStatusEnum
from app.crud import crud_user

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login")

# Dependency lấy Database Session


def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()


def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None or payload.get("type") != "access" or not payload.get("jti"):
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = crud_user.get_user(db, user_id=int(user_id))
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.status != UserStatusEnum.ACTIVE:
        raise HTTPException(status_code=403, detail="Inactive or locked user")
    return current_user


def require_role(allowed_roles: list[str]):
    def role_checker(current_user: User = Depends(get_current_active_user)):
        if current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have enough permission"
            )
        return current_user
    return role_checker

# Nơi đây sẽ thêm get_current_user sau khi làm Authentication


def get_audit_context(
    request: Request,
    current_user: User = Depends(get_current_active_user)
) -> tuple[Request, User]:
    """Lấy thông tin context cho audit log.

    Args:
        request (Request): Request object từ FastAPI.
        current_user (User): Người dùng hiện tại đã được xác thực.

    Returns:
        dict: Trả về một dictionary chứa thông tin context cho audit log.
    """
    return request, current_user


def get_section_or_404(db: Session, section_id: int) -> ClassSection:
    section = db.get(ClassSection, section_id)
    if section is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    return section


def require_section_access(
    db: Session,
    section_id: int,
    current_user: User,
) -> ClassSection:
    """Return a section only when it belongs to the lecturer or caller is an admin."""
    section = get_section_or_404(db, section_id)
    if current_user.role == RoleEnum.ADMIN:
        return section
    if current_user.role == RoleEnum.LECTURER and section.lecturer_id == current_user.id:
        return section
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_student_access(
    db: Session,
    student_id: int,
    current_user: User,
) -> None:
    """Allow admins, the student themself, or a lecturer teaching that student."""
    if current_user.role == RoleEnum.ADMIN:
        return
    if current_user.role == RoleEnum.STUDENT and current_user.id == student_id:
        return
    if current_user.role == RoleEnum.LECTURER:
        teaches_student = (
            db.query(Enrollment.id)
            .join(ClassSection, Enrollment.section_id == ClassSection.id)
            .filter(
                Enrollment.student_id == student_id,
                Enrollment.status == EnrollmentStatusEnum.ENROLLED,
                ClassSection.lecturer_id == current_user.id,
            )
            .first()
        )
        if teaches_student:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_session_access(
    db: Session,
    session_id: int,
    current_user: User,
) -> AttendanceSession:
    session = db.get(AttendanceSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance session not found")
    require_section_access(db, session.section_id, current_user)
    return session


def require_record_staff_access(
    db: Session,
    record_id: int,
    current_user: User,
) -> AttendanceRecord:
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
    require_session_access(db, record.session_id, current_user)
    return record

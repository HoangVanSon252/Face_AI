from sqlalchemy.orm import Session
from app.models.user import User, UserStatusEnum
from app.models.token import RefreshToken
from app.schemas.user import UserCreate
from app.core.security import get_password_hash
from datetime import datetime, timedelta
import hashlib
from app.core.exceptions import APIException
from sqlalchemy.exc import IntegrityError

def get_user(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()

def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()

def get_user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username).first()

def create_user(db: Session, user: UserCreate) -> User:
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
        full_name=user.full_name,
        role=user.role,
        status=UserStatusEnum.ACTIVE
    )
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError as e:
        db.rollback()
        raise APIException(
            status_code=400, 
            code="USER_ALREADY_EXISTS", 
            message="Email hoặc Username đã tồn tại trong hệ thống."
        )
    except Exception as e:
        db.rollback()
        raise APIException(
            status_code=500, 
            code="DATABASE_ERROR", 
            message="Lỗi khi tạo người dùng."
        )

def create_refresh_token_db(db: Session, user_id: int, token: str, expires_days: int) -> RefreshToken:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(days=expires_days)
    db_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token

def get_refresh_token_db(db: Session, token: str) -> RefreshToken | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

def revoke_refresh_token(db: Session, token_obj: RefreshToken) -> None:
    """Thu hồi 1 refresh token cụ thể (Token Rotation)."""
    token_obj.revoked_at = datetime.utcnow()
    db.commit()

def revoke_all_user_tokens(db: Session, user_id: int) -> None:
    """Thu hồi toàn bộ refresh token của user (khi phát hiện token reuse / compromise)."""
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked_at.is_(None),
    ).update({"revoked_at": datetime.utcnow()})
    db.commit()

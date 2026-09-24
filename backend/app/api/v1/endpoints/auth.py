"""
Auth Router – Tích hợp đầy đủ:
- HttpOnly Cookie cho Refresh Token
- CSRF Double Submit Cookie
- Rate Limiting trên các endpoint nhạy cảm
- Token Rotation: mỗi lần refresh → refresh token cũ bị thu hồi, cấp mới
"""
from datetime import timedelta, datetime
from typing import Any
import secrets

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api import dependencies
from app.core import security
from app.core.config import settings
from app.core.csrf import set_auth_cookies, clear_auth_cookies, verify_csrf_token
from app.core.limiter import limiter
from app.crud import crud_user
from app.schemas.token import Token
from app.models.user import UserStatusEnum
from app.schemas.user import UserResponse

router = APIRouter()


# ─────────────────────────────────────────────
# POST /login/access-token
# Rate limit: 5 lần/phút/IP
# ─────────────────────────────────────────────
@router.post("/login", response_model=Token)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(dependencies.get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Any:
    """
    Đăng nhập – trả về Access Token trong body JSON.
    Refresh Token được set vào HttpOnly Cookie.
    CSRF Token được set vào readable Cookie.
    """
    # Xác thực thông tin đăng nhập
    user = crud_user.get_user_by_username(db, username=form_data.username)
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if user.status != UserStatusEnum.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )

    # Tạo Access Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        user.id, expires_delta=access_token_expires
    )

    # Tạo Refresh Token và lưu vào DB (hash)
    raw_refresh_token = secrets.token_urlsafe(32)
    crud_user.create_refresh_token_db(
        db,
        user_id=user.id,
        token=raw_refresh_token,
        expires_days=settings.REFRESH_TOKEN_EXPIRE_DAYS,
    )

    # Set HttpOnly Cookie cho Refresh Token + CSRF Cookie
    set_auth_cookies(response, raw_refresh_token)

    # Chỉ trả access_token trong body – refresh_token KHÔNG trong body nữa
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


# ─────────────────────────────────────────────
# POST /register
# Rate limit: 3 lần/phút/IP
# ─────────────────────────────────────────────
@router.post("/refresh", response_model=Token)
@limiter.limit(settings.RATE_LIMIT_REFRESH)
def refresh_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(dependencies.get_db),
    refresh_token: str | None = Cookie(default=None),          # Đọc từ HttpOnly Cookie
    _csrf: None = Depends(verify_csrf_token),                   # CSRF check
) -> Any:
    """
    Cấp lại Access Token bằng Refresh Token từ HttpOnly Cookie.
    Áp dụng Token Rotation: thu hồi token cũ → cấp token mới.
    Yêu cầu header: X-CSRF-Token (lấy từ cookie csrf_token).
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found in cookies",
        )

    token_obj = crud_user.get_refresh_token_db(db, refresh_token)
    if not token_obj:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if token_obj.revoked_at is not None:
        # Token bị dùng lại sau khi đã thu hồi → có thể bị đánh cắp
        # Thu hồi toàn bộ session của user (giả định bị compromise)
        crud_user.revoke_all_user_tokens(db, user_id=token_obj.user_id)
        raise HTTPException(
            status_code=401,
            detail="Refresh token reuse detected. All sessions revoked.",
        )
    if token_obj.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Refresh token expired")

    # Token Rotation: Thu hồi token cũ
    crud_user.revoke_refresh_token(db, token_obj=token_obj)

    # Cấp Access Token mới
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = security.create_access_token(
        token_obj.user_id, expires_delta=access_token_expires
    )

    # Cấp Refresh Token mới và set lại cookie
    new_raw_refresh = secrets.token_urlsafe(32)
    crud_user.create_refresh_token_db(
        db,
        user_id=token_obj.user_id,
        token=new_raw_refresh,
        expires_days=settings.REFRESH_TOKEN_EXPIRE_DAYS,
    )
    set_auth_cookies(response, new_raw_refresh)

    return {
        "access_token": new_access_token,
        "token_type": "bearer",
    }


# ─────────────────────────────────────────────
# POST /logout
# Thu hồi refresh token, xoá cookie
# ─────────────────────────────────────────────
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: Session = Depends(dependencies.get_db),
    refresh_token: str | None = Cookie(default=None),
) -> None:
    """Logout – thu hồi refresh token và xoá cookie."""
    if refresh_token:
        token_obj = crud_user.get_refresh_token_db(db, refresh_token)
        if token_obj and token_obj.revoked_at is None:
            crud_user.revoke_refresh_token(db, token_obj=token_obj)
    clear_auth_cookies(response)

@router.get("/me", response_model=UserResponse)
def get_me(current_user = Depends(dependencies.get_current_active_user)) -> UserResponse:
    """Return the authenticated user's profile."""
    return current_user
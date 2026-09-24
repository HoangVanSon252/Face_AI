"""
CSRF Protection – Double Submit Cookie Pattern
-------------------------------------------------
Cách hoạt động:
1. Khi login thành công, server set 2 cookie:
   - "refresh_token": HttpOnly, Secure, SameSite=Lax  (JS KHÔNG đọc được)
   - "csrf_token":    Readable bởi JS, SameSite=Lax   (JS đọc được để gửi kèm header)

2. Khi gọi /refresh-token, client PHẢI gửi:
   - Cookie "refresh_token" (browser tự gửi)
   - Header "X-CSRF-Token": <giá trị từ cookie csrf_token>

3. Server verify: CSRF header == CSRF cookie → hợp lệ
   → Chặn CSRF vì trang độc hại không thể đọc cookie để lấy CSRF token

Tại sao an toàn hơn lưu vào localStorage:
   - HttpOnly cookie: XSS không thể đánh cắp refresh token
   - CSRF token: CSRF attack không thể gửi đúng header
"""
import secrets
import hashlib
import hmac
from fastapi import Cookie, Header, HTTPException, status, Response, Request
from app.core.config import settings


def generate_csrf_token() -> str:
    """Tạo CSRF token ngẫu nhiên 32 bytes."""
    return secrets.token_urlsafe(32)


def verify_csrf_token(
    csrf_token_cookie: str | None = Cookie(default=None, alias="csrf_token"),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> None:
    """
    Dependency để verify CSRF token theo Double Submit Cookie pattern.
    Dùng hmac.compare_digest để chống timing attack.
    """
    if not csrf_token_cookie or not x_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing",
        )
    if not hmac.compare_digest(csrf_token_cookie, x_csrf_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token mismatch",
        )


def set_auth_cookies(response: Response, refresh_token: str) -> str:
    """
    Set 2 cookies sau khi login thành công:
    1. refresh_token (HttpOnly – không đọc được từ JS)
    2. csrf_token (readable – JS đọc để gửi kèm header)
    Trả về csrf_token để có thể dùng ở nơi khác nếu cần.
    """
    csrf_token = generate_csrf_token()
    max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60  # seconds

    # Cookie 1: Refresh Token – HttpOnly (XSS proof)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,                          # JS không đọc được
        secure=settings.COOKIE_SECURE,         # False dev, True production (HTTPS)
        samesite=settings.COOKIE_SAMESITE,     # "lax" chặn CSRF qua cross-site
        max_age=max_age,
        path="/api/v1/auth/refresh",          # Chỉ gửi cookie đến endpoint này
    )

    # Cookie 2: CSRF Token – NOT HttpOnly (JS cần đọc để gửi header)
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,                         # JS đọc được
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=max_age,
        path="/",
    )

    return csrf_token


def clear_auth_cookies(response: Response) -> None:
    """Xoá cả 2 cookie khi logout."""
    response.delete_cookie(key="refresh_token", path="/api/v1/auth/refresh")
    response.delete_cookie(key="csrf_token", path="/")

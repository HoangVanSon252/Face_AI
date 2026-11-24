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

3. Server verify: CSRF header == CSRF cookie VÀ chữ ký HMAC(CSRF_SECRET_KEY)
   của token khớp với refresh token hiện tại → hợp lệ
   → Chặn CSRF vì trang độc hại không thể đọc cookie để lấy CSRF token,
     và không thể cấy (cookie tossing) token của phiên khác

Tại sao an toàn hơn lưu vào localStorage:
   - HttpOnly cookie: XSS không thể đánh cắp refresh token
   - CSRF token: CSRF attack không thể gửi đúng header
"""
import secrets
import hashlib
import hmac
from fastapi import Cookie, Header, HTTPException, status, Response, Request
from app.core.config import settings


def _signature(nonce: str, refresh_token: str) -> str:
    message = f"{nonce}.{refresh_token}".encode()
    return hmac.new(settings.CSRF_SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def generate_csrf_token(refresh_token: str) -> str:
    """Signed token "<nonce>.<hmac>": the HMAC binds it to this login's refresh token,
    so a token planted from another session (cookie tossing) does not verify."""
    nonce = secrets.token_urlsafe(32)
    return f"{nonce}.{_signature(nonce, refresh_token)}"


def _is_valid_signature(token: str, refresh_token: str) -> bool:
    nonce, _, signature = token.partition(".")
    return bool(nonce and signature) and hmac.compare_digest(signature, _signature(nonce, refresh_token))


def verify_csrf_token(
    csrf_token_cookie: str | None = Cookie(default=None, alias="csrf_token"),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
    refresh_token: str | None = Cookie(default=None),
) -> None:
    """
    Dependency verify CSRF: Double Submit Cookie + chữ ký HMAC gắn với refresh token.
    Dùng hmac.compare_digest để chống timing attack.
    Không có refresh token thì không có gì để bảo vệ (refresh/logout đều vô hại).
    """
    if not refresh_token:
        return
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
    if not _is_valid_signature(x_csrf_token, refresh_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token signature is invalid",
        )


def set_auth_cookies(response: Response, refresh_token: str) -> str:
    """
    Set 2 cookies sau khi login thành công:
    1. refresh_token (HttpOnly – không đọc được từ JS)
    2. csrf_token (readable – JS đọc để gửi kèm header)
    Trả về csrf_token để có thể dùng ở nơi khác nếu cần.
    """
    csrf_token = generate_csrf_token(refresh_token)
    max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60  # seconds

    # Cookie 1: Refresh Token – HttpOnly (XSS proof)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,                          # JS không đọc được
        secure=settings.COOKIE_SECURE,         # False dev, True production (HTTPS)
        samesite=settings.COOKIE_SAMESITE,     # "lax" chặn CSRF qua cross-site
        max_age=max_age,
        path="/api/v1/auth",
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
    response.delete_cookie(key="refresh_token", path="/api/v1/auth")
    response.delete_cookie(key="csrf_token", path="/")

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit import AuditLog

SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "access_token",
    "refresh_token",
    "token",
    "embedding",
    "embedding_data",
    "image",
    "image_data",
}


def _sanitize_details(details: dict[str, Any] | None) -> dict[str, Any] | None:
    """_summary_
        Loại bỏ các key nhạy cảm khỏi chi tiết để tránh lưu trữ thông tin nhạy cảm trong log.
    Args:
        details (dict[str, Any] | None): _description_
    """

    if details is None:
        return None

    sanitized: dict[str, Any] = {}

    for key, value in details.items():
        if key.lower() in SENSITIVE_KEYS:
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = value
    return sanitized


def get_request_metadata(request: Request) -> tuple[str | None, str | None]:
    """Lấy thông tin metadata từ request.

    Args:
        request (Request): Request object từ FastAPI.

    Returns:
        tuple[str | None, str | None]: Trả về một tuple chứa IP và user agent.
    """
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return client_ip, user_agent


def write_audit_log(
    db: Session,
    *,
    action: str,
    actor_user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    request: Request | None = None,
    details: dict[str, Any] | None = None,
    commit: bool = False,
) -> AuditLog:
    """_summary_
        Tạo một bản ghi audit log mới và lưu vào cơ sở dữ liệu.
        Mặc định không commit, nếu muốn commit thì set commit=True.
    Args:
        db (Session): _description_
        action (str): _description_
        actor_user_id (int | None, optional): _description_. Defaults to None.
        entity_type (str | None, optional): _description_. Defaults to None.
        entity_id (int | None, optional): _description_. Defaults to None.
        request (Request | None, optional): _description_. Defaults to None.
        details (dict[str, Any] | None, optional): _description_. Defaults to None.
        commit (bool, optional): _description_. Defaults to False.
    """
    ip_address = None
    user_agent = None
    if request is not None:
        ip_address, user_agent = get_request_metadata(request)

    audit_log = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent is not None else None,
        details=_sanitize_details(details)
    )

    db.add(audit_log)
    db.flush()  # Flush để lấy ID của bản ghi mới tạo
    if commit:
        db.commit()
        # Refresh để lấy dữ liệu mới nhất từ cơ sở dữ liệu
        db.refresh(audit_log)
    return audit_log

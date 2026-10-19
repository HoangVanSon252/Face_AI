import base64
import hashlib
import re
import time
from datetime import datetime, timezone
from uuid import uuid4

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from app.core.config import settings

# Chỉ chấp nhận JPEG/PNG từ webcam; không nhận SVG, HTML hoặc file tùy ý.
DATA_URL_PATTERN = re.compile(
    r"^data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/=\s]+)$"
)


def _client():
    """
    Tạo S3 client kết nối MinIO.
    path addressing giúp MinIO chạy ổn định trong Docker/local.
    """
    if not (
        settings.OBJECT_STORAGE_ENDPOINT
        and settings.OBJECT_STORAGE_ACCESS_KEY
        and settings.OBJECT_STORAGE_SECRET_KEY
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not configured",
        )

    return boto3.client(
        "s3",
        endpoint_url=settings.OBJECT_STORAGE_ENDPOINT,
        aws_access_key_id=settings.OBJECT_STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.OBJECT_STORAGE_SECRET_KEY,
        use_ssl=settings.OBJECT_STORAGE_SECURE,
        config=Config(s3={"addressing_style": "path"}),
    )


def ensure_bucket() -> None:
    """
    Tạo bucket một lần nếu chưa tồn tại.
    Không public bucket: ảnh chỉ được truy cập qua Backend/presigned URL.
    """
    client = _client()

    # Compose starts the S3 container first, but its API can need a few seconds.
    for attempt in range(10):
        try:
            client.head_bucket(Bucket=settings.OBJECT_STORAGE_BUCKET)
            return
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchBucket"}:
                client.create_bucket(Bucket=settings.OBJECT_STORAGE_BUCKET)
                return
            if attempt == 9:
                raise
        except Exception:
            if attempt == 9:
                raise
        time.sleep(1)


def _decode_image_data_url(image_data_url: str) -> tuple[bytes, str]:
    """
    Kiểm tra data URL và trả về raw bytes + MIME type.
    Backend không ghi raw Base64 vào MySQL.
    """
    match = DATA_URL_PATTERN.match(image_data_url.strip())

    if not match:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only JPEG and PNG data URLs are accepted",
        )

    mime_type = match.group(1)

    try:
        raw_image = base64.b64decode(match.group(2), validate=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid image Base64 payload",
        ) from exc

    if not raw_image:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image payload is empty",
        )

    if len(raw_image) > settings.MAX_REQUEST_BODY_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds the configured request size limit",
        )

    return raw_image, mime_type


def upload_attendance_evidence(
    session_id: int,
    image_data_url: str,
) -> tuple[str, str]:
    """
    Lưu ảnh nhận diện vào MinIO.

    Returns:
        object_uri: URI ổn định lưu vào MySQL, không phải public URL.
        checksum: SHA-256 để kiểm tra toàn vẹn file.
    """
    raw_image, mime_type = _decode_image_data_url(image_data_url)
    extension = "jpg" if mime_type == "image/jpeg" else "png"

    # Phân vùng object key theo ngày và phiên để dễ retention/backup.
    date_path = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    object_key = (
        f"attendance-evidence/{date_path}/"
        f"session-{session_id}/{uuid4()}.{extension}"
    )

    checksum = hashlib.sha256(raw_image).hexdigest()

    try:
        client = _client()

        client.put_object(
            Bucket=settings.OBJECT_STORAGE_BUCKET,
            Key=object_key,
            Body=raw_image,
            ContentType=mime_type,
            Metadata={"sha256": checksum},
        )
    except ClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to store attendance evidence",
        ) from exc

    # MySQL lưu URI nội bộ ổn định, không lưu presigned URL hết hạn.
    return (
        f"s3://{settings.OBJECT_STORAGE_BUCKET}/{object_key}",
        checksum,
    )


def create_download_url(object_uri: str, expires_in_seconds: int = 300) -> str:
    """
    Sinh URL tạm thời 5 phút khi giao diện cần xem ảnh.
    Không lưu URL này trong database.
    """
    prefix = f"s3://{settings.OBJECT_STORAGE_BUCKET}/"

    if not object_uri.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid object storage URI",
        )

    object_key = object_uri.removeprefix(prefix)

    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.OBJECT_STORAGE_BUCKET,
                "Key": object_key,
            },
            ExpiresIn=expires_in_seconds,
        )
    except ClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to generate evidence download URL",
        ) from exc

import base64
import os
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "EduFace AI"
    API_V1_STR: str = "/api/v1"

    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    DEBUG: bool = False

    SECRET_KEY: str
    CSRF_SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    ALLOWED_HOSTS: str = "localhost,127.0.0.1,testserver,backend"
    MAX_REQUEST_BODY_SIZE: int = 5 * 1024 * 1024

    # Per client IP. A campus behind one NAT signs in at once at the start of
    # class, so this stays generous; brute force is stopped per account below.
    RATE_LIMIT_LOGIN: str = "300/minute"
    LOGIN_MAX_FAILURES: int = 10
    LOGIN_LOCKOUT_MINUTES: int = 15
    RATE_LIMIT_REGISTER: str = "30/minute"
    RATE_LIMIT_REFRESH: str = "60/minute"
    # Kiosk gửi 1 frame / 1,6s ≈ 38/phút; 90/phút chừa dư cho thao tác chụp tay.
    RATE_LIMIT_FACE_RECOGNIZE: str = "90/minute"
    RATE_LIMIT_FACE_DETECT: str = "90/minute"
    RATE_LIMIT_FACE_ENROLL: str = "10/hour"
    RATE_LIMIT_WS_TICKET: str = "30/minute"

    MYSQL_USER: str
    MYSQL_PASSWORD: str
    MYSQL_HOST: str
    MYSQL_PORT: str
    MYSQL_DB: str
    MYSQL_SSL_CA: str | None = None
    MYSQL_SSL_CA_BASE64: str | None = None
    MYSQL_SSL_REQUIRED: bool = False
    REDIS_URL: str
    # Pool tính cho MỖI worker: tổng kết nối = (POOL_SIZE + MAX_OVERFLOW) × số worker,
    # phải nhỏ hơn max_connections của MySQL.
    DB_POOL_SIZE: int = 15
    DB_MAX_OVERFLOW: int = 15
    DB_POOL_TIMEOUT: int = 10
    DB_CONNECT_TIMEOUT: int = 10
    REPORT_MAX_ROWS: int = 10_000
    AI_SERVICE_URL: str = "http://ai_service:8002"
    AI_SERVICE_TIMEOUT_SECONDS: float = 10.0
    # Concurrent AI calls per backend worker (x BACKEND_WORKERS should roughly
    # match AI_WORKERS x 2) and how long a frame may wait for a slot.
    AI_MAX_INFLIGHT_PER_WORKER: int = 2
    AI_QUEUE_WAIT_SECONDS: float = 2.0
    OBJECT_STORAGE_ENDPOINT: str | None = None
    OBJECT_STORAGE_ACCESS_KEY: str | None = None
    OBJECT_STORAGE_SECRET_KEY: str | None = None
    OBJECT_STORAGE_BUCKET: str = "face-attendance"
    OBJECT_STORAGE_SECURE: bool = False
    FACE_MIN_SAMPLES: int = 3
    FACE_MAX_SAMPLES: int = 5
    FACE_MIN_QUALITY_SCORE: float = 0.65
    FACE_MATCH_THRESHOLD: float = 0.55
    # InsightFace cosine scores around 0.80 are stable matches in this
    # deployment; lower scores remain in the teacher review queue.
    FACE_AUTO_APPROVE_THRESHOLD: float = 0.80

    # AES-256-GCM key (Base64, 32 bytes) encrypting face embeddings at rest.
    # Generate: python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"
    # Losing it makes every enrolled face profile unreadable: back it up with the DB backups.
    FACE_EMBEDDING_KEY: str | None = None
    # Version of the biometric consent text the student agrees to (stored with each consent).
    BIOMETRIC_POLICY_VERSION: str = "2026-10"
    # Attendance evidence photos are deleted after this many days (0 = keep forever).
    EVIDENCE_RETENTION_DAYS: int = 180

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "production"}:
                return False
        raise ValueError("DEBUG must be a boolean value")

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DB}"
        )

    @property
    def mysql_connect_args(self) -> dict:
        connect_args: dict = {"connect_timeout": self.DB_CONNECT_TIMEOUT}
        if self.MYSQL_SSL_REQUIRED:
            certificate_path = self.MYSQL_SSL_CA
            if certificate_path and not Path(certificate_path).exists():
                local_fallback = Path(__file__).resolve(
                ).parents[2] / "certs" / "ca.pem"
                if local_fallback.exists():
                    certificate_path = str(local_fallback)
            if self.MYSQL_SSL_CA_BASE64:
                try:
                    certificate = base64.b64decode(
                        self.MYSQL_SSL_CA_BASE64, validate=True
                    )
                except ValueError as exc:
                    raise ValueError(
                        "MYSQL_SSL_CA_BASE64 must be valid Base64") from exc

                certificate_file = Path("/tmp/aiven-ca.pem")
                certificate_file.write_bytes(certificate)
                certificate_file.chmod(0o600)
                certificate_path = str(certificate_file)

            if not certificate_path:
                raise ValueError(
                    "MYSQL_SSL_CA or MYSQL_SSL_CA_BASE64 is required when "
                    "MYSQL_SSL_REQUIRED is true"
                )
            connect_args["ssl"] = {"ca": certificate_path}
        return connect_args

    @property
    def allowed_origins_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.ALLOWED_ORIGINS.split(",")
            if origin.strip()
        ]

    @property
    def allowed_hosts_list(self) -> list[str]:
        hosts = [
            host.strip()
            for host in self.ALLOWED_HOSTS.split(",")
            if host.strip()
        ]
        render_hostname = os.getenv("RENDER_EXTERNAL_HOSTNAME", "").strip()
        if render_hostname and render_hostname not in hosts:
            hosts.append(render_hostname)
        return hosts

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.ENVIRONMENT != "production":
            return self

        insecure_secrets = {
            "change-me",
            "change-me-csrf-secret",
            "tao_mot_chuoi_that_dai_va_bao_mat_o_day",
            "another-random-secret-for-csrf-protection",
        }

        if len(self.SECRET_KEY) < 32 or self.SECRET_KEY in insecure_secrets:
            raise ValueError("SECRET_KEY must be a strong production secret")

        if len(self.CSRF_SECRET_KEY) < 32 or self.CSRF_SECRET_KEY in insecure_secrets:
            raise ValueError(
                "CSRF_SECRET_KEY must be a strong production secret")

        if not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SECURE must be true in production")

        if "*" in self.allowed_origins_list:
            raise ValueError("Wildcard CORS origin is forbidden in production")

        if not self.FACE_EMBEDDING_KEY:
            raise ValueError("FACE_EMBEDDING_KEY is required in production")

        return self


settings = Settings()

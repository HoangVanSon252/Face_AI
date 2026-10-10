from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Face Attendance AI"
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

    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REGISTER: str = "3/minute"
    RATE_LIMIT_REFRESH: str = "10/minute"

    MYSQL_USER: str
    MYSQL_PASSWORD: str
    MYSQL_HOST: str
    MYSQL_PORT: str
    MYSQL_DB: str
    REDIS_URL: str
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_CONNECT_TIMEOUT: int = 10
    REPORT_MAX_ROWS: int = 10_000

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
    def allowed_origins_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.ALLOWED_ORIGINS.split(",")
            if origin.strip()
        ]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [
            host.strip()
            for host in self.ALLOWED_HOSTS.split(",")
            if host.strip()
        ]

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
            raise ValueError("CSRF_SECRET_KEY must be a strong production secret")

        if not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SECURE must be true in production")

        if "*" in self.allowed_origins_list:
            raise ValueError("Wildcard CORS origin is forbidden in production")

        return self


settings = Settings()

from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "EduFace AI Service"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            return v.lower() in ("1", "true", "yes", "debug", "dev", "development")
        return bool(v)

    MODEL_PROVIDERS: str = "CPUExecutionProvider"
    DETECTION_SIZE: int = 640

    # Chưa có model anti-spoofing thì để trống.
    LIVENESS_MODEL_PATH: str | None = None
    # Các giá trị dưới đây phải khớp model ONNX anti-spoofing đã được kiểm thử.
    LIVENESS_INPUT_WIDTH: int = 112
    LIVENESS_INPUT_HEIGHT: int = 112
    LIVENESS_INPUT_LAYOUT: Literal["NCHW", "NHWC"] = "NCHW"
    LIVENESS_COLOR_SPACE: Literal["RGB", "BGR"] = "RGB"
    LIVENESS_NORMALIZATION: Literal["zero_one", "minus_one_one", "none"] = "zero_one"
    LIVENESS_LIVE_CLASS_INDEX: int = 1
    LIVENESS_THRESHOLD: float = 0.85

    @property
    def model_providers_list(self) -> list[str]:
        return [
            provider.strip()
            for provider in self.MODEL_PROVIDERS.split(",")
            if provider.strip()
        ]

    @property
    def liveness_model_file(self) -> Path | None:
        return Path(self.LIVENESS_MODEL_PATH) if self.LIVENESS_MODEL_PATH else None


settings = Settings()

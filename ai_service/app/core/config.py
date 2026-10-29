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
    DEBUG: bool = False

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            return v.lower() in ("1", "true", "yes", "debug", "dev", "development")
        return bool(v)

    MODEL_PROVIDERS: str = "CPUExecutionProvider"
    DETECTION_SIZE: int = 640
    # Số luồng ONNX cho mỗi tiến trình. Khi chạy nhiều worker, đặt bằng
    # số_core / số_worker để các worker không tranh nhau CPU. 0 = để ONNX tự chọn.
    ONNX_INTRA_OP_THREADS: int = 0
    # Ảnh lớn hơn sẽ bị thu nhỏ trước khi suy luận để giới hạn CPU/RAM.
    MAX_IMAGE_SIDE: int = 1280

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
    def liveness_fallback_allowed(self) -> bool:
        """Heuristic det_score chỉ được dùng khi phát triển cục bộ, không bao giờ ở production."""
        return self.ENVIRONMENT == "development" and self.DEBUG

    @property
    def liveness_model_file(self) -> Path | None:
        return Path(self.LIVENESS_MODEL_PATH) if self.LIVENESS_MODEL_PATH else None


settings = Settings()

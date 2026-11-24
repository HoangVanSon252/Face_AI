from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass(frozen=True)
class LivenessModelSpec:
    path: Path
    # None = legacy 15% margin crop; a number = bbox enlarged N times (MiniFASNet).
    crop_scale: float | None


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

    # Ensemble anti-spoofing: danh sách "đường_dẫn@tỉ_lệ_crop" cách nhau bởi dấu phẩy,
    # ví dụ MiniFASNet: /models/minifasnet_v2_2.7.onnx@2.7,/models/minifasnet_v1se_4.0.onnx@4.0
    # Điểm cuối = trung bình xác suất "mặt thật" của các model.
    LIVENESS_MODELS: str | None = None
    # Cấu hình cũ một model (crop lề 15%); chỉ dùng khi LIVENESS_MODELS trống.
    LIVENESS_MODEL_PATH: str | None = None
    # Các giá trị dưới đây phải khớp model ONNX anti-spoofing đã được kiểm thử.
    LIVENESS_INPUT_WIDTH: int = 112
    LIVENESS_INPUT_HEIGHT: int = 112
    LIVENESS_INPUT_LAYOUT: Literal["NCHW", "NHWC"] = "NCHW"
    LIVENESS_COLOR_SPACE: Literal["RGB", "BGR"] = "RGB"
    LIVENESS_NORMALIZATION: Literal["zero_one", "minus_one_one", "none"] = "zero_one"
    LIVENESS_LIVE_CLASS_INDEX: int = 1
    LIVENESS_THRESHOLD: float = 0.85
    # "logits" áp softmax; "probabilities" dùng nguyên; "auto" tự đoán theo giá trị.
    LIVENESS_OUTPUT_TYPE: Literal["auto", "logits", "probabilities"] = "auto"

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
    def liveness_models(self) -> list[LivenessModelSpec]:
        if self.LIVENESS_MODELS:
            specs = []
            for item in self.LIVENESS_MODELS.split(","):
                path, _, scale = item.strip().partition("@")
                if path:
                    specs.append(LivenessModelSpec(Path(path), float(scale) if scale else None))
            return specs
        if self.LIVENESS_MODEL_PATH:
            return [LivenessModelSpec(Path(self.LIVENESS_MODEL_PATH), None)]
        return []


settings = Settings()

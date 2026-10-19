from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.face import FaceProfileStatusEnum


class FaceSample(BaseModel):
    image_base64: str = Field(min_length=100)
    is_primary: bool = False


class FaceProfileCreate(BaseModel):
    consent: bool
    samples: list[FaceSample] = Field(min_length=3, max_length=5)

    @field_validator("consent")
    @classmethod
    def consent_is_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Biometric consent is required")
        return value


class FaceProfileResponse(BaseModel):
    id: int
    student_id: int
    status: FaceProfileStatusEnum
    sample_count: int
    model_name: str
    model_version: str
    embedding_dimension: int
    consent_at: datetime
    activated_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class RecognitionRequest(BaseModel):
    image_base64: str = Field(min_length=100)


class RecognitionResponse(BaseModel):
    matched: bool
    student_id: int | None = None
    attendance_record_id: int | None = None
    confidence_score: float | None = None
    quality_score: float
    review_required: bool
    reason: str | None = None


class EvidenceUrlResponse(BaseModel):
    """Short-lived URL returned only after staff authorization."""

    url: str
    expires_in_seconds: int

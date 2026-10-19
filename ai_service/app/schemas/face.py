from pydantic import BaseModel, Field


class ImageRequest(BaseModel):
    image_base64: str = Field(min_length=100)


class FaceDetection(BaseModel):
    bbox: list[float] = Field(min_length=4, max_length=4)
    confidence: float = Field(ge=0, le=1)
    # InsightFace five-point landmarks: left eye, right eye, nose and mouth
    # corners. They let the client validate real head rotation, not movement.
    landmarks: list[list[float]] = Field(default_factory=list)


class DetectResponse(BaseModel):
    faces: list[FaceDetection]
    face_count: int


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    dimension: int = Field(ge=1)
    quality_score: float = Field(ge=0, le=1)
    detection_confidence: float = Field(ge=0, le=1)
    bbox: list[float] = Field(min_length=4, max_length=4)


class LivenessResponse(BaseModel):
    available: bool
    is_live: bool | None = None
    score: float | None = Field(default=None, ge=0, le=1)
    reason: str | None = None

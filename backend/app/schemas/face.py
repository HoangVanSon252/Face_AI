from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from app.models.face import FaceProfileStatusEnum

class FaceSample(BaseModel):
    image_base64: str
    is_primary: bool = False

class FaceProfileCreate(BaseModel):
    consent: bool
    samples: List[FaceSample]

class FaceQualitySummary(BaseModel):
    accepted: int
    rejected: int

class FaceProfileResponse(BaseModel):
    id: int
    student_id: int
    status: FaceProfileStatusEnum
    sample_count: Optional[int] = None
    quality_summary: Optional[FaceQualitySummary] = None

    model_config = ConfigDict(from_attributes=True)

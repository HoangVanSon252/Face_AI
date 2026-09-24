from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from decimal import Decimal
from app.models.attendance import SessionStatusEnum, AttendanceStatusEnum, VerificationMethodEnum, ReviewStatusEnum, AppealStatusEnum

# ==================== SESSIONS ====================
class AttendanceSessionCreate(BaseModel):
    session_no: int
    title: Optional[str] = None
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    late_after_at: datetime

class AttendanceSessionResponse(BaseModel):
    id: int
    section_id: int
    session_no: int
    status: SessionStatusEnum
    
    model_config = ConfigDict(from_attributes=True)


# ==================== ĐIỂM DANH BẰNG NHẬN DIỆN ====================
class RecognizeRequest(BaseModel):
    image_base64: str
    captured_at: datetime
    client_request_id: str

class AttendanceRecordResponse(BaseModel):
    id: int
    session_id: int
    student_id: int
    status: AttendanceStatusEnum
    verification_method: VerificationMethodEnum
    check_in_at: Optional[datetime] = None
    confidence_score: Optional[Decimal] = None
    liveness_score: Optional[Decimal] = None
    review_status: ReviewStatusEnum

    model_config = ConfigDict(from_attributes=True)

class RecognizeResponse(BaseModel):
    attendance: AttendanceRecordResponse


# ==================== DUYỆT / CHỈNH SỬA THỦ CÔNG ====================
class AttendanceManualUpdate(BaseModel):
    status: AttendanceStatusEnum
    review_status: ReviewStatusEnum
    note: Optional[str] = None


# ==================== PHÚC KHẢO (APPEALS) ====================
class AppealCreate(BaseModel):
    reason: str
    evidence_uri: Optional[str] = None

class AppealResponse(BaseModel):
    id: int
    attendance_record_id: int
    status: AppealStatusEnum
    
    model_config = ConfigDict(from_attributes=True)

class AppealResolveRequest(BaseModel):
    decision: AppealStatusEnum # APPROVED hoặc REJECTED
    attendance_status: AttendanceStatusEnum
    resolution_note: Optional[str] = None

class AppealResolveResponse(BaseModel):
    id: int
    status: AppealStatusEnum
    attendance: AttendanceRecordResponse

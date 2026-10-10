from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.attendance import (
    AppealStatusEnum,
    AttendanceStatusEnum,
    ReviewStatusEnum,
    SessionStatusEnum,
    VerificationMethodEnum,
)


class AttendanceSessionCreate(BaseModel):
    session_no: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=200)
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    late_after_at: datetime

    @field_validator("scheduled_end_at")
    @classmethod
    def end_must_follow_start(cls, value: datetime, info):
        start = info.data.get("scheduled_start_at")
        if start and value <= start:
            raise ValueError("scheduled_end_at must be after scheduled_start_at")
        return value

    @field_validator("late_after_at")
    @classmethod
    def late_time_must_be_in_schedule(cls, value: datetime, info):
        start = info.data.get("scheduled_start_at")
        end = info.data.get("scheduled_end_at")
        if start and value < start:
            raise ValueError("late_after_at must not be before scheduled_start_at")
        if end and value > end:
            raise ValueError("late_after_at must not be after scheduled_end_at")
        return value


class AttendanceSessionResponse(BaseModel):
    id: int
    section_id: int
    session_no: int
    title: str | None
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    late_after_at: datetime
    opened_at: datetime | None
    closed_at: datetime | None
    status: SessionStatusEnum
    created_by: int

    model_config = ConfigDict(from_attributes=True)


class ManualCheckInCreate(BaseModel):
    student_id: int
    check_in_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)


class AttendanceRecordResponse(BaseModel):
    id: int
    session_id: int
    student_id: int
    status: AttendanceStatusEnum
    verification_method: VerificationMethodEnum
    check_in_at: datetime | None
    confidence_score: Decimal | None
    liveness_score: Decimal | None
    review_status: ReviewStatusEnum
    reviewed_by: int | None
    reviewed_at: datetime | None
    note: str | None

    model_config = ConfigDict(from_attributes=True)


class AttendanceManualUpdate(BaseModel):
    status: AttendanceStatusEnum
    note: str | None = Field(default=None, max_length=500)


class AttendanceReviewRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class AttendancePage(BaseModel):
    items: list[AttendanceRecordResponse]
    total: int
    page: int
    page_size: int


class AppealCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=5000)
    evidence_uri: str | None = Field(default=None, max_length=500)


class AppealResponse(BaseModel):
    id: int
    attendance_record_id: int
    student_id: int
    reason: str
    evidence_uri: str | None
    status: AppealStatusEnum
    resolved_by: int | None
    resolution_note: str | None
    created_at: datetime
    resolved_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class AppealResolveRequest(BaseModel):
    decision: AppealStatusEnum
    attendance_status: AttendanceStatusEnum | None = None
    resolution_note: str | None = Field(default=None, max_length=5000)

    @field_validator("decision")
    @classmethod
    def decision_must_be_final(cls, value: AppealStatusEnum):
        if value not in {AppealStatusEnum.APPROVED, AppealStatusEnum.REJECTED}:
            raise ValueError("decision must be APPROVED or REJECTED")
        return value


class SessionSummary(BaseModel):
    session_id: int
    total: int
    present: int
    late: int
    absent: int
    excused: int

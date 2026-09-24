import enum
from sqlalchemy import Column, BigInteger, String, DateTime, Enum, ForeignKey, CheckConstraint, SmallInteger, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class SessionStatusEnum(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"

class AttendanceStatusEnum(str, enum.Enum):
    PRESENT = "PRESENT"
    LATE = "LATE"
    ABSENT = "ABSENT"
    EXCUSED = "EXCUSED"

class VerificationMethodEnum(str, enum.Enum):
    FACE = "FACE"
    MANUAL = "MANUAL"
    IMPORT = "IMPORT"

class ReviewStatusEnum(str, enum.Enum):
    AUTO_APPROVED = "AUTO_APPROVED"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class AppealStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"

class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    section_id = Column(BigInteger, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False, index=True)
    session_no = Column(SmallInteger, nullable=False)
    title = Column(String(200), nullable=True)
    scheduled_start_at = Column(DateTime, nullable=False, index=True)
    scheduled_end_at = Column(DateTime, nullable=False)
    opened_at = Column(DateTime, nullable=True)
    late_after_at = Column(DateTime, nullable=False)
    closed_at = Column(DateTime, nullable=True)
    status = Column(Enum(SessionStatusEnum), nullable=False, default=SessionStatusEnum.SCHEDULED)
    created_by = Column(BigInteger, ForeignKey("lecturers.user_id", ondelete="RESTRICT"), nullable=False)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('section_id', 'session_no', name='uk_sessions_section_no'),
        CheckConstraint('scheduled_end_at > scheduled_start_at', name='ck_sessions_schedule'),
        CheckConstraint('late_after_at >= scheduled_start_at AND late_after_at <= scheduled_end_at', name='ck_sessions_late_after'),
    )

    # Liên kết với các bảng khác
    section = relationship("ClassSection", primaryjoin="AttendanceSession.section_id == ClassSection.id")
    creator = relationship("Lecturer", primaryjoin="AttendanceSession.created_by == Lecturer.user_id")
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(BigInteger, ForeignKey("students.user_id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(Enum(AttendanceStatusEnum), nullable=False, default=AttendanceStatusEnum.ABSENT)
    verification_method = Column(Enum(VerificationMethodEnum), nullable=False, default=VerificationMethodEnum.FACE)
    check_in_at = Column(DateTime, nullable=True)
    confidence_score = Column(Numeric(5, 4), nullable=True)
    liveness_score = Column(Numeric(5, 4), nullable=True)
    evidence_image_uri = Column(String(500), nullable=True)
    review_status = Column(Enum(ReviewStatusEnum), nullable=False, default=ReviewStatusEnum.PENDING)
    reviewed_by = Column(BigInteger, ForeignKey("lecturers.user_id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    note = Column(String(500), nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('session_id', 'student_id', name='uk_attendance_session_student'),
        CheckConstraint('confidence_score IS NULL OR (confidence_score BETWEEN 0 AND 1)', name='ck_attendance_confidence'),
        CheckConstraint('liveness_score IS NULL OR (liveness_score BETWEEN 0 AND 1)', name='ck_attendance_liveness'),
    )

    session = relationship("AttendanceSession", back_populates="records")
    student = relationship("Student", primaryjoin="AttendanceRecord.student_id == Student.user_id")
    reviewer = relationship("Lecturer", primaryjoin="AttendanceRecord.reviewed_by == Lecturer.user_id")
    appeals = relationship("AttendanceAppeal", back_populates="record", cascade="all, delete-orphan")

class AttendanceAppeal(Base):
    __tablename__ = "attendance_appeals"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    attendance_record_id = Column(BigInteger, ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(BigInteger, ForeignKey("students.user_id", ondelete="RESTRICT"), nullable=False)
    reason = Column(Text, nullable=False)
    evidence_uri = Column(String(500), nullable=True)
    status = Column(Enum(AppealStatusEnum), nullable=False, default=AppealStatusEnum.PENDING, index=True)
    resolved_by = Column(BigInteger, ForeignKey("lecturers.user_id", ondelete="SET NULL"), nullable=True)
    resolution_note = Column(Text, nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('attendance_record_id', 'student_id', name='uk_appeals_record_student'),
    )

    record = relationship("AttendanceRecord", back_populates="appeals")
    student = relationship("Student", primaryjoin="AttendanceAppeal.student_id == Student.user_id")
    resolver = relationship("Lecturer", primaryjoin="AttendanceAppeal.resolved_by == Lecturer.user_id")

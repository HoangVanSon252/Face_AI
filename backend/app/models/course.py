import enum
from sqlalchemy import Column, BigInteger, String, DateTime, Enum, ForeignKey, Date, Boolean, SmallInteger, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class SemesterStatusEnum(str, enum.Enum):
    PLANNED = "PLANNED"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"

class SectionStatusEnum(str, enum.Enum):
    PLANNED = "PLANNED"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"

class EnrollmentStatusEnum(str, enum.Enum):
    ENROLLED = "ENROLLED"
    DROPPED = "DROPPED"
    COMPLETED = "COMPLETED"

class Semester(Base):
    __tablename__ = "semesters"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    code = Column(String(30), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(Enum(SemesterStatusEnum), nullable=False, default=SemesterStatusEnum.PLANNED)
    
    created_at = Column(DateTime, nullable=False, default=func.now())

    # Đảm bảo ngày kết thúc >= ngày bắt đầu
    __table_args__ = (
        CheckConstraint('end_date >= start_date', name='ck_semesters_dates'),
    )

    class_sections = relationship("ClassSection", back_populates="semester")

class Course(Base):
    __tablename__ = "courses"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    course_code = Column(String(30), unique=True, nullable=False)
    course_name = Column(String(200), nullable=False)
    credits = Column(SmallInteger, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    # Tín chỉ từ 1 đến 20
    __table_args__ = (
        CheckConstraint('credits BETWEEN 1 AND 20', name='ck_courses_credits'),
    )

    class_sections = relationship("ClassSection", back_populates="course")

class ClassSection(Base):
    __tablename__ = "class_sections"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    section_code = Column(String(40), nullable=False)
    course_id = Column(BigInteger, ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False)
    semester_id = Column(BigInteger, ForeignKey("semesters.id", ondelete="RESTRICT"), nullable=False)
    lecturer_id = Column(BigInteger, ForeignKey("lecturers.user_id", ondelete="RESTRICT"), nullable=False)
    room = Column(String(50), nullable=True)
    status = Column(Enum(SectionStatusEnum), nullable=False, default=SectionStatusEnum.PLANNED)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    # Một học kỳ không được có 2 lớp học phần trùng mã
    __table_args__ = (
        UniqueConstraint('semester_id', 'section_code', name='uk_sections_semester_code'),
    )

    course = relationship("Course", back_populates="class_sections")
    semester = relationship("Semester", back_populates="class_sections")
    
    # Liên kết với Lecturer bên user.py
    lecturer = relationship("Lecturer", back_populates="assigned_sections", primaryjoin="ClassSection.lecturer_id == Lecturer.user_id")
    enrollments = relationship("Enrollment", back_populates="section", cascade="all, delete-orphan")
    # sessions điểm danh sẽ thêm ở bước sau

class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    section_id = Column(BigInteger, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(BigInteger, ForeignKey("students.user_id", ondelete="RESTRICT"), nullable=False)
    status = Column(Enum(EnrollmentStatusEnum), nullable=False, default=EnrollmentStatusEnum.ENROLLED)
    
    enrolled_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    # Sinh viên không được đăng ký 2 lần vào cùng 1 lớp học phần
    __table_args__ = (
        UniqueConstraint('section_id', 'student_id', name='uk_enrollments_section_student'),
    )

    section = relationship("ClassSection", back_populates="enrollments")
    # Liên kết với Student bên user.py
    student = relationship("Student", back_populates="enrollments", primaryjoin="Enrollment.student_id == Student.user_id")

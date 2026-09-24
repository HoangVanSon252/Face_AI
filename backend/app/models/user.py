import enum
from sqlalchemy import Column, BigInteger, String, DateTime, Enum, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class RoleEnum(str, enum.Enum):
    STUDENT = "STUDENT"
    LECTURER = "LECTURER"
    ADMIN = "ADMIN"

class UserStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    LOCKED = "LOCKED"

class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(150), nullable=False)
    role = Column(Enum(RoleEnum), nullable=False)
    status = Column(Enum(UserStatusEnum), nullable=False, default=UserStatusEnum.ACTIVE)
    last_login_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    # Khai báo quan hệ (Relationships)
    student_profile = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")
    lecturer_profile = relationship("Lecturer", back_populates="user", uselist=False, cascade="all, delete-orphan")
    # Các quan hệ khác như refresh_tokens, audit_logs sẽ được thêm vào sau
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="actor")

class Student(Base):
    __tablename__ = "students"

    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    student_code = Column(String(30), unique=True, nullable=False)
    date_of_birth = Column(Date, nullable=True)
    cohort = Column(String(20), nullable=True)
    major = Column(String(100), nullable=True)
    administrative_class = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="student_profile")
    # Quan hệ tới enrollments, face_profiles sẽ thêm sau
    enrollments = relationship("Enrollment", back_populates="student", cascade="all, delete-orphan")
    face_profiles = relationship("FaceProfile", back_populates="student", cascade="all, delete-orphan")


class Lecturer(Base):
    __tablename__ = "lecturers"

    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    lecturer_code = Column(String(30), unique=True, nullable=False)
    department = Column(String(150), nullable=True)
    academic_title = Column(String(100), nullable=True)
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="lecturer_profile")
    # Quan hệ tới class_sections sẽ thêm sau
    assigned_sections = relationship("ClassSection", back_populates="lecturer", cascade="all, delete-orphan")


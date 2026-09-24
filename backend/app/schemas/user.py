from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.user import RoleEnum, UserStatusEnum


class StudentProfileCreate(BaseModel):
    student_code: str
    date_of_birth: Optional[date] = None
    cohort: Optional[str] = None
    major: Optional[str] = None
    administrative_class: Optional[str] = None


class LecturerProfileCreate(BaseModel):
    lecturer_code: str
    department: Optional[str] = None
    academic_title: Optional[str] = None


class StudentCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    student: StudentProfileCreate


class LecturerCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    lecturer: LecturerProfileCreate


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: RoleEnum
    student: Optional[StudentProfileCreate] = None
    lecturer: Optional[LecturerProfileCreate] = None


class StudentProfileResponse(StudentProfileCreate):
    user_id: int
    model_config = ConfigDict(from_attributes=True)


class LecturerProfileResponse(LecturerProfileCreate):
    user_id: int
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: RoleEnum
    status: UserStatusEnum
    student_profile: Optional[StudentProfileResponse] = None
    lecturer_profile: Optional[LecturerProfileResponse] = None
    model_config = ConfigDict(from_attributes=True)
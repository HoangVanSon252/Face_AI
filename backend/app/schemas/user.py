from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

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


class AdminUserResponse(UserResponse):
    username: str
    created_at: datetime
    updated_at: datetime
    last_login_at: Optional[datetime] = None


class AdminUserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    email: EmailStr | None = None
    department: str | None = Field(default=None, max_length=150)
    role: RoleEnum | None = None
    status: UserStatusEnum | None = None

    @model_validator(mode="after")
    def has_changes(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class AdminPasswordReset(BaseModel):
    new_password: str = Field(min_length=12, max_length=128)

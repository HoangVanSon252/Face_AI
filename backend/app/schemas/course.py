from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import date, datetime
from app.models.course import SemesterStatusEnum, SectionStatusEnum, EnrollmentStatusEnum

# ==================== SEMESTER ====================
class SemesterCreate(BaseModel):
    code: str
    name: str
    start_date: date
    end_date: date

class SemesterResponse(BaseModel):
    id: int
    code: str
    name: str
    start_date: date
    end_date: date
    status: SemesterStatusEnum
    
    model_config = ConfigDict(from_attributes=True)

# ==================== COURSE ====================
class CourseCreate(BaseModel):
    course_code: str
    course_name: str
    credits: int

class CourseResponse(BaseModel):
    id: int
    course_code: str
    course_name: str
    credits: int
    is_active: bool
    
    model_config = ConfigDict(from_attributes=True)

# ==================== CLASS SECTION ====================
class ClassSectionCreate(BaseModel):
    section_code: str
    course_id: int
    semester_id: int
    lecturer_id: int
    room: Optional[str] = None

class ClassSectionResponse(BaseModel):
    id: int
    section_code: str
    course_id: int
    semester_id: int
    lecturer_id: int
    room: Optional[str] = None
    status: SectionStatusEnum
    
    model_config = ConfigDict(from_attributes=True)

# ==================== ENROLLMENT ====================
class EnrollmentCreate(BaseModel):
    student_id: int
    section_id: Optional[int] = None

class EnrollmentResponse(BaseModel):
    id: int
    section_id: int
    student_id: int
    status: EnrollmentStatusEnum
    enrolled_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

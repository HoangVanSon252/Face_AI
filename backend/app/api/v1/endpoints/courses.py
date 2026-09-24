from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import dependencies
from app.crud import crud_course
from app.schemas.course import (
    SemesterCreate, SemesterResponse,
    CourseCreate, CourseResponse,
    ClassSectionCreate, ClassSectionResponse,   # đúng tên bạn đặt
    EnrollmentCreate, EnrollmentResponse,
)
from app.models.user import RoleEnum

router = APIRouter()

require_admin  = dependencies.require_role([RoleEnum.ADMIN.value])
require_staff  = dependencies.require_role([RoleEnum.ADMIN.value, RoleEnum.LECTURER.value])


# ─── Semesters ────────────────────────────────────────────
@router.get("/semesters", response_model=list[SemesterResponse])
def list_semesters(
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_staff),
):
    return crud_course.get_semesters(db)

@router.post("/semesters", response_model=SemesterResponse, status_code=201)
def create_semester(
    data: SemesterCreate,
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_admin),
):
    return crud_course.create_semester(db, data)


# ─── Courses ──────────────────────────────────────────────
@router.get("/courses", response_model=list[CourseResponse])
def list_courses(
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_staff),
):
    return crud_course.get_courses(db)

@router.post("/courses", response_model=CourseResponse, status_code=201)
def create_course(
    data: CourseCreate,
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_admin),
):
    return crud_course.create_course(db, data)


# ─── ClassSections ────────────────────────────────────────
@router.get("/sections", response_model=list[ClassSectionResponse])
def list_sections(
    semester_id: int,
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_staff),
):
    return crud_course.get_sections_by_semester(db, semester_id)

@router.post("/sections", response_model=ClassSectionResponse, status_code=201)
def create_section(
    data: ClassSectionCreate,
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_admin),
):
    return crud_course.create_section(db, data)


# ─── Enrollments ──────────────────────────────────────────
@router.get("/sections/{section_id}/enrollments", response_model=list[EnrollmentResponse])
def list_enrollments(
    section_id: int,
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_staff),
):
    return crud_course.get_enrollments_by_section(db, section_id)

@router.post("/sections/{section_id}/enrollments", response_model=EnrollmentResponse, status_code=201)
def enroll_student(
    section_id: int,
    data: EnrollmentCreate,
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_admin),
):
    data.section_id = section_id
    return crud_course.enroll_student(db, data)

@router.delete("/sections/{section_id}/enrollments/{student_id}", status_code=204)
def unenroll_student(
    section_id: int,
    student_id: int,
    db: Session = Depends(dependencies.get_db),
    _: Any = Depends(require_admin),
):
    ok = crud_course.unenroll_student(db, section_id=section_id, student_id=student_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Enrollment not found")

@router.patch("/semesters/{semester_id}", response_model=SemesterResponse)
def update_semester(semester_id: int, data: SemesterCreate, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    from app.models.course import Semester
    obj = db.get(Semester, semester_id)
    if not obj: raise HTTPException(status_code=404, detail="Semester not found")
    for field, value in data.model_dump().items(): setattr(obj, field, value)
    db.commit(); db.refresh(obj); return obj

@router.delete("/semesters/{semester_id}", status_code=204)
def delete_semester(semester_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    from app.models.course import Semester
    obj = db.get(Semester, semester_id)
    if not obj: raise HTTPException(status_code=404, detail="Semester not found")
    db.delete(obj); db.commit()

@router.patch("/courses/{course_id}", response_model=CourseResponse)
def update_course(course_id: int, data: CourseCreate, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    from app.models.course import Course
    obj = db.get(Course, course_id)
    if not obj: raise HTTPException(status_code=404, detail="Course not found")
    for field, value in data.model_dump().items(): setattr(obj, field, value)
    db.commit(); db.refresh(obj); return obj

@router.delete("/courses/{course_id}", status_code=204)
def delete_course(course_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    from app.models.course import Course
    obj = db.get(Course, course_id)
    if not obj: raise HTTPException(status_code=404, detail="Course not found")
    db.delete(obj); db.commit()

@router.patch("/sections/{section_id}", response_model=ClassSectionResponse)
def update_section(section_id: int, data: ClassSectionCreate, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    from app.models.course import ClassSection
    obj = db.get(ClassSection, section_id)
    if not obj: raise HTTPException(status_code=404, detail="Section not found")
    for field, value in data.model_dump().items(): setattr(obj, field, value)
    db.commit(); db.refresh(obj); return obj

@router.delete("/sections/{section_id}", status_code=204)
def delete_section(section_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    from app.models.course import ClassSection
    obj = db.get(ClassSection, section_id)
    if not obj: raise HTTPException(status_code=404, detail="Section not found")
    db.delete(obj); db.commit()

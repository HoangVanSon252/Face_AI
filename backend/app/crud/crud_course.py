from sqlalchemy.orm import Session
from app.models.course import (
    Semester, Course, ClassSection, Enrollment,
    EnrollmentStatusEnum,
)
from app.schemas.course import (
    SemesterCreate, CourseCreate, ClassSectionCreate, EnrollmentCreate,
)
from app.core.exceptions import APIException
from sqlalchemy.exc import IntegrityError


# ─── Semester ────────────────────────────────────
def create_semester(db: Session, data: SemesterCreate) -> Semester:
    obj = Semester(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def get_semesters(db: Session):
    return db.query(Semester).order_by(Semester.start_date.desc()).all()


# ─── Course ──────────────────────────────────────
def create_course(db: Session, data: CourseCreate) -> Course:
    obj = Course(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def get_courses(db: Session, active_only: bool = True):
    q = db.query(Course)
    if active_only:
        q = q.filter(Course.is_active == True)
    return q.all()


# ─── ClassSection ────────────────────────────────
def create_section(db: Session, data: ClassSectionCreate) -> ClassSection:
    try:
        obj = ClassSection(**data.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
    except IntegrityError:
        db.rollback()
        raise APIException(
            status_code=409,
            code="DUPLICATE_SECTION",
            message="Mã lớp học phần đã tồn tại trong học kỳ này.",
        )

def get_sections_by_semester(db: Session, semester_id: int):
    return (
        db.query(ClassSection)
        .filter(ClassSection.semester_id == semester_id)
        .all()
    )

def get_section(db: Session, section_id: int) -> ClassSection | None:
    return db.query(ClassSection).filter(ClassSection.id == section_id).first()


# ─── Enrollment ──────────────────────────────────
def enroll_student(db: Session, data: EnrollmentCreate) -> Enrollment:
    try:
        obj = Enrollment(**data.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
    except IntegrityError:
        db.rollback()
        raise APIException(
            status_code=409,
            code="ALREADY_ENROLLED",
            message="Sinh viên đã đăng ký lớp học phần này.",
        )

def get_enrollments_by_section(db: Session, section_id: int):
    return (
        db.query(Enrollment)
        .filter(Enrollment.section_id == section_id)
        .all()
    )

def unenroll_student(db: Session, section_id: int, student_id: int) -> bool:
    obj = (
        db.query(Enrollment)
        .filter(
            Enrollment.section_id == section_id,
            Enrollment.student_id == student_id,
            Enrollment.status == EnrollmentStatusEnum.ENROLLED,
        )
        .first()
    )
    if not obj:
        return False
    obj.status = EnrollmentStatusEnum.DROPPED
    db.commit()
    return True

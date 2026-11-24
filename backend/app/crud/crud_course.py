from datetime import datetime
from sqlalchemy.orm import Session
from app.models.course import (
    Semester, Course, ClassSection, Enrollment,
    EnrollmentStatusEnum, SemesterStatusEnum,
)
from app.schemas.course import (
    SemesterCreate, CourseCreate, ClassSectionCreate, EnrollmentCreate,
)
from app.core.exceptions import APIException
from sqlalchemy.exc import IntegrityError


# ─── Semester ────────────────────────────────────
def create_semester(db: Session, data: SemesterCreate) -> Semester:
    if data.end_date < data.start_date:
        raise APIException(status_code=422, code="INVALID_SEMESTER_DATES", message="Ngày kết thúc phải sau ngày bắt đầu.")
    data.code = data.code.strip().upper()
    if data.status == SemesterStatusEnum.ACTIVE:
        # Only one semester is current at a time.
        db.query(Semester).filter(Semester.status == SemesterStatusEnum.ACTIVE).update(
            {Semester.status: SemesterStatusEnum.PLANNED}, synchronize_session=False
        )
    obj = Semester(**data.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIException(status_code=409, code="DUPLICATE_SEMESTER", message="Mã học kỳ đã tồn tại.")
    db.refresh(obj)
    return obj

def get_semesters(db: Session):
    return db.query(Semester).order_by(Semester.start_date.desc()).all()


# ─── Course ──────────────────────────────────────
def create_course(db: Session, data: CourseCreate) -> Course:
    obj = Course(**data.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIException(status_code=409, code="DUPLICATE_COURSE", message="Mã môn học đã tồn tại.")
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

def get_sections_by_semester(
    db: Session,
    semester_id: int | None = None,
    lecturer_id: int | None = None,
    student_id: int | None = None,
):
    query = db.query(ClassSection)
    if semester_id is not None:
        query = query.filter(ClassSection.semester_id == semester_id)
    if lecturer_id is not None:
        query = query.filter(ClassSection.lecturer_id == lecturer_id)
    if student_id is not None:
        query = query.join(Enrollment, ClassSection.id == Enrollment.section_id).filter(
            Enrollment.student_id == student_id,
            Enrollment.status == EnrollmentStatusEnum.ENROLLED,
        )
    return query.all()

def get_section(db: Session, section_id: int) -> ClassSection | None:
    return db.query(ClassSection).filter(ClassSection.id == section_id).first()


# ─── Enrollment ──────────────────────────────────
def enroll_student(db: Session, data: EnrollmentCreate) -> Enrollment:
    existing = (
        db.query(Enrollment)
        .filter(
            Enrollment.section_id == data.section_id,
            Enrollment.student_id == data.student_id,
        )
        .first()
    )
    if existing:
        if existing.status == EnrollmentStatusEnum.ENROLLED:
            raise APIException(
                status_code=409,
                code="ALREADY_ENROLLED",
                message="Sinh viên đã đăng ký lớp học phần này.",
            )
        existing.status = EnrollmentStatusEnum.ENROLLED
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

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
        .filter(
            Enrollment.section_id == section_id,
            Enrollment.status == EnrollmentStatusEnum.ENROLLED,
        )
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

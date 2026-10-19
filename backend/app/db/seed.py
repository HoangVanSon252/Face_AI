"""Database Seeding Script for E2E and Local Testing.
Seeds default users, profiles, and academic structure:
- admin   / Admin@123456   (Role: ADMIN, Status: ACTIVE)
- teacher / Teacher@123456 (Role: LECTURER, Status: ACTIVE, code: GV001)
- student / Student@123456 (Role: STUDENT, Status: ACTIVE, code: SV001)
- Academic: Semester FA26, Course CS101, ClassSection CS101-01, Enrollment.
"""
from datetime import date
import logging
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.core.security import get_password_hash
from app.models.user import User, Student, Lecturer, RoleEnum, UserStatusEnum
from app.models.course import (
    Semester,
    Course,
    ClassSection,
    Enrollment,
    SemesterStatusEnum,
    SectionStatusEnum,
    EnrollmentStatusEnum,
)

logger = logging.getLogger("seed")
logging.basicConfig(level=logging.INFO)


def seed_users_and_profiles(db: Session) -> dict[str, User]:
    users = {}

    # 1. Admin
    admin_user = db.query(User).filter(User.username == "admin").first()
    if not admin_user:
        admin_user = User(
            username="admin",
            email="admin@eduface.edu.vn",
            password_hash=get_password_hash("Admin@123456"),
            full_name="Quản Trị Viên Hệ Thống",
            role=RoleEnum.ADMIN,
            status=UserStatusEnum.ACTIVE,
        )
        db.add(admin_user)
        db.flush()
        logger.info("Created user: admin")
    else:
        admin_user.password_hash = get_password_hash("Admin@123456")
        admin_user.status = UserStatusEnum.ACTIVE
        logger.info("Updated user: admin")
    users["admin"] = admin_user

    # 2. Teacher (Lecturer)
    teacher_user = db.query(User).filter(User.username == "teacher").first()
    if not teacher_user:
        teacher_user = User(
            username="teacher",
            email="teacher@eduface.edu.vn",
            password_hash=get_password_hash("Teacher@123456"),
            full_name="ThS. Nguyễn Văn Thầy",
            role=RoleEnum.LECTURER,
            status=UserStatusEnum.ACTIVE,
        )
        db.add(teacher_user)
        db.flush()
        logger.info("Created user: teacher")
    else:
        teacher_user.password_hash = get_password_hash("Teacher@123456")
        teacher_user.status = UserStatusEnum.ACTIVE
        logger.info("Updated user: teacher")

    teacher_profile = db.query(Lecturer).filter(Lecturer.user_id == teacher_user.id).first()
    if not teacher_profile:
        teacher_profile = Lecturer(
            user_id=teacher_user.id,
            lecturer_code="GV001",
            department="Khoa Công nghệ Thông tin",
            academic_title="Thạc sĩ",
        )
        db.add(teacher_profile)
        logger.info("Created lecturer profile for: teacher")
    users["teacher"] = teacher_user

    # 3. Student
    student_user = db.query(User).filter(User.username == "student").first()
    if not student_user:
        student_user = User(
            username="student",
            email="student@eduface.edu.vn",
            password_hash=get_password_hash("Student@123456"),
            full_name="Trần Minh Khoa",
            role=RoleEnum.STUDENT,
            status=UserStatusEnum.ACTIVE,
        )
        db.add(student_user)
        db.flush()
        logger.info("Created user: student")
    else:
        student_user.password_hash = get_password_hash("Student@123456")
        student_user.status = UserStatusEnum.ACTIVE
        logger.info("Updated user: student")

    student_profile = db.query(Student).filter(Student.user_id == student_user.id).first()
    if not student_profile:
        student_profile = Student(
            user_id=student_user.id,
            student_code="SV001",
            date_of_birth=date(2004, 5, 15),
            cohort="K16",
            major="Kỹ thuật Phần mềm",
            administrative_class=None,
        )
        db.add(student_profile)
        logger.info("Created student profile for: student")
    else:
        if student_profile.administrative_class == "SE1601":
            student_profile.administrative_class = None
            logger.info("Cleaned up mock SE1601 administrative class for student")
    users["student"] = student_user

    db.commit()
    return users


def seed_academic_structure(db: Session, users: dict[str, User]) -> None:
    teacher_id = users["teacher"].id
    student_id = users["student"].id

    # 1. Semester FA26
    semester = db.query(Semester).filter(Semester.code == "FA26").first()
    if not semester:
        semester = Semester(
            code="FA26",
            name="Học kỳ Thu 2026 (Fall 2026)",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 12, 31),
            status=SemesterStatusEnum.ACTIVE,
        )
        db.add(semester)
        db.flush()
        logger.info("Created semester: FA26")

    # 2. Course CS101
    course = db.query(Course).filter(Course.course_code == "CS101").first()
    if not course:
        course = Course(
            course_code="CS101",
            course_name="Nhập môn Trí tuệ Nhân tạo & Thị giác Máy tính",
            credits=3,
            is_active=True,
        )
        db.add(course)
        db.flush()
        logger.info("Created course: CS101")

    # 3. ClassSection CS101-01
    section = (
        db.query(ClassSection)
        .filter(ClassSection.semester_id == semester.id, ClassSection.section_code == "CS101-01")
        .first()
    )
    if not section:
        section = ClassSection(
            section_code="CS101-01",
            course_id=course.id,
            semester_id=semester.id,
            lecturer_id=teacher_id,
            room="Phòng Lab A-402",
            status=SectionStatusEnum.OPEN,
        )
        db.add(section)
        db.flush()
        logger.info("Created class section: CS101-01")

    # 4. Enrollment
    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.section_id == section.id, Enrollment.student_id == student_id)
        .first()
    )
    if not enrollment:
        enrollment = Enrollment(
            section_id=section.id,
            student_id=student_id,
            status=EnrollmentStatusEnum.ENROLLED,
        )
        db.add(enrollment)
        logger.info(f"Enrolled student #{student_id} into section #{section.id}")

    db.commit()


def main():
    logger.info("=== Starting database seed ===")
    db = SessionLocal()
    try:
        users = seed_users_and_profiles(db)
        seed_academic_structure(db, users)
        logger.info("=== Database seed completed successfully! ===")
    except Exception as exc:
        logger.error(f"Error during database seed: {exc}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()


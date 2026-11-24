from typing import Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.api import dependencies
from app.crud import crud_course
from app.schemas.course import (
    SemesterCreate, SemesterUpdate, SemesterResponse,
    CourseCreate, CourseResponse,
    ClassSectionCreate, ClassSectionResponse,   # đúng tên bạn đặt
    EnrollmentCreate, EnrollmentResponse,
)
from app.models.user import RoleEnum
from app.services import notifications
from app.services.realtime import realtime_service
from app.services.audit_service import write_audit_log
from app.models.course import SubjectClass, AdministrativeClass, Enrollment, EnrollmentStatusEnum

router = APIRouter()


class AdministrativeClassPayload(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str | None = Field(default=None, max_length=150)
    department: str | None = Field(default=None, max_length=150)

class ClassSectionUpdate(BaseModel):
    section_code: str | None = Field(default=None, min_length=1, max_length=40)
    lecturer_id: int | None = None
    room: str | None = Field(default=None, max_length=50)


def _notify_assignment(db: Session, section, actor_id: int) -> None:
    notifications.notify(
        db, notifications.others([section.lecturer_id], actor_id), "SECTION_ASSIGNED",
        f"Bạn được phân công dạy ca {notifications.section_label(section)}",
        f"Phòng {section.room}" if section.room else None,
        link="/subjects",
    )


def _notify_roster(db: Session, section, student_ids: list[int], added: bool) -> None:
    label = notifications.section_label(section)
    if added:
        title, kind = f"Bạn được thêm vào ca học {label}", "ENROLLED"
    else:
        title, kind = f"Bạn đã được rút khỏi ca học {label}", "UNENROLLED"
    notifications.notify(db, student_ids, kind, title, link="/schedule")


require_admin  = dependencies.require_role([RoleEnum.ADMIN.value])
require_staff  = dependencies.require_role([RoleEnum.ADMIN.value, RoleEnum.LECTURER.value])


@router.get("/student-classes")
def list_administrative_classes(db: Session = Depends(dependencies.get_db), _: Any = Depends(require_staff)):
    return db.query(AdministrativeClass).order_by(AdministrativeClass.code).all()


@router.post("/student-classes", status_code=201)
def create_administrative_class(data: AdministrativeClassPayload, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    code = data.code.strip().upper()
    if db.query(AdministrativeClass).filter(AdministrativeClass.code == code).first():
        raise HTTPException(status_code=409, detail="Administrative class already exists")
    item = AdministrativeClass(code=code, name=data.name, department=data.department)
    db.add(item); write_audit_log(db, action="ADMINISTRATIVE_CLASS_CREATED", actor_user_id=current_user.id, entity_type="ADMINISTRATIVE_CLASS", details={"code": code}); db.commit(); db.refresh(item)
    return item


@router.patch("/student-classes/{class_id}")
def update_administrative_class(class_id: int, data: AdministrativeClassPayload, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    item = db.get(AdministrativeClass, class_id)
    if not item: raise HTTPException(status_code=404, detail="Administrative class not found")
    old_code, item.code = item.code, data.code.strip().upper()
    item.name, item.department = data.name, data.department
    if old_code != item.code:
        from app.models.user import Student
        db.query(Student).filter(Student.administrative_class == old_code).update({Student.administrative_class: item.code})
    write_audit_log(db, action="ADMINISTRATIVE_CLASS_UPDATED", actor_user_id=current_user.id, entity_type="ADMINISTRATIVE_CLASS", entity_id=class_id, details={"code": item.code}); db.commit(); db.refresh(item)
    return item


@router.delete("/student-classes/{class_id}", status_code=204)
def delete_administrative_class(class_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    item = db.get(AdministrativeClass, class_id)
    if not item: raise HTTPException(status_code=404, detail="Administrative class not found")
    from app.models.user import Student
    db.query(Student).filter(Student.administrative_class == item.code).update({Student.administrative_class: None})
    db.delete(item); write_audit_log(db, action="ADMINISTRATIVE_CLASS_DELETED", actor_user_id=current_user.id, entity_type="ADMINISTRATIVE_CLASS", entity_id=class_id, details={"code": item.code}); db.commit()


@router.post("/student-classes/{class_id}/students/{student_id}", status_code=204)
def add_student_to_administrative_class(class_id: int, student_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    from app.models.user import Student
    item = db.get(AdministrativeClass, class_id)
    student = db.get(Student, student_id)
    if not item or not student:
        raise HTTPException(status_code=404, detail="Class or student not found")
    student.administrative_class = item.code
    write_audit_log(db, action="STUDENT_ASSIGNED_TO_ADMINISTRATIVE_CLASS", actor_user_id=current_user.id, entity_type="ADMINISTRATIVE_CLASS", entity_id=class_id, details={"student_id": student_id})
    db.commit()


@router.delete("/student-classes/{class_id}/students/{student_id}", status_code=204)
def remove_student_from_administrative_class(class_id: int, student_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    from app.models.user import Student
    item = db.get(AdministrativeClass, class_id)
    student = db.get(Student, student_id)
    if not item or not student or student.administrative_class != item.code:
        raise HTTPException(status_code=404, detail="Student is not in this class")
    student.administrative_class = None
    write_audit_log(db, action="STUDENT_REMOVED_FROM_ADMINISTRATIVE_CLASS", actor_user_id=current_user.id, entity_type="ADMINISTRATIVE_CLASS", entity_id=class_id, details={"student_id": student_id})
    db.commit()


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
    current_user=Depends(dependencies.get_current_active_user),
):
    return crud_course.get_courses(db)

@router.post("/courses", response_model=CourseResponse, status_code=201)
def create_course(
    data: CourseCreate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(require_admin),
):
    course = crud_course.create_course(db, data)
    write_audit_log(db, action="COURSE_CREATED", actor_user_id=current_user.id, entity_type="COURSE", entity_id=course.id, details={"course_code": course.course_code})
    db.commit()
    db.refresh(course)
    return course


# ─── ClassSections ────────────────────────────────────────
@router.get("/sections", response_model=list[ClassSectionResponse])
def list_sections(
    semester_id: int | None = None,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.get_current_active_user),
):
    lecturer_id = current_user.id if current_user.role == RoleEnum.LECTURER else None
    student_id = current_user.id if current_user.role == RoleEnum.STUDENT else None
    return crud_course.get_sections_by_semester(
        db, semester_id, lecturer_id=lecturer_id, student_id=student_id
    )

@router.post("/sections", response_model=ClassSectionResponse, status_code=201)
def create_section(
    data: ClassSectionCreate,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(require_admin),
):
    from app.models.user import Lecturer
    if db.get(Lecturer, data.lecturer_id) is None:
        raise HTTPException(status_code=422, detail="Hãy chọn giảng viên phụ trách ca học")
    section = crud_course.create_section(db, data)
    write_audit_log(db, action="CLASS_CREATED", actor_user_id=current_user.id, entity_type="CLASS_SECTION", entity_id=section.id, details={"section_code": section.section_code})
    _notify_assignment(db, section, current_user.id)
    db.commit()
    db.refresh(section)
    return section


# ─── Enrollments ──────────────────────────────────────────
@router.get("/sections/{section_id}/enrollments", response_model=list[EnrollmentResponse])
def list_enrollments(
    section_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(require_staff),
):
    dependencies.require_section_access(db, section_id, current_user)
    return crud_course.get_enrollments_by_section(db, section_id)

@router.post("/sections/{section_id}/enrollments", response_model=EnrollmentResponse, status_code=201)
def enroll_student(
    section_id: int,
    data: EnrollmentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(require_staff),
):
    if current_user.role == RoleEnum.LECTURER:
        dependencies.require_section_access(db, section_id, current_user)
    data.section_id = section_id
    enrollment = crud_course.enroll_student(db, data)
    write_audit_log(db, action="STUDENT_ENROLLED", actor_user_id=current_user.id, entity_type="ENROLLMENT", entity_id=enrollment.id, details={"section_id": section_id, "student_id": enrollment.student_id})
    _notify_roster(db, enrollment.section, [enrollment.student_id], added=True)
    db.commit()
    db.refresh(enrollment)
    # Commit occurs in CRUD before background tasks run; notify every affected
    # user so other tabs/devices update without a manual page reload.
    payload = {"section_id": section_id, "student_id": enrollment.student_id, "action": "enrolled"}
    background_tasks.add_task(realtime_service.send_user_event, current_user.id, "CLASS_ROSTER_CHANGED", payload)
    if enrollment.student_id != current_user.id:
        background_tasks.add_task(realtime_service.send_user_event, enrollment.student_id, "CLASS_ROSTER_CHANGED", payload)
    return enrollment

@router.delete("/sections/{section_id}/enrollments/{student_id}", status_code=204)
def unenroll_student(
    section_id: int,
    student_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(require_staff),
):
    if current_user.role == RoleEnum.LECTURER:
        dependencies.require_section_access(db, section_id, current_user)
    ok = crud_course.unenroll_student(db, section_id=section_id, student_id=student_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    write_audit_log(db, action="STUDENT_UNENROLLED", actor_user_id=current_user.id, entity_type="CLASS_SECTION", entity_id=section_id, details={"student_id": student_id})
    _notify_roster(db, dependencies.get_section_or_404(db, section_id), [student_id], added=False)
    db.commit()
    payload = {"section_id": section_id, "student_id": student_id, "action": "unenrolled"}
    background_tasks.add_task(realtime_service.send_user_event, current_user.id, "CLASS_ROSTER_CHANGED", payload)
    if student_id != current_user.id:
        background_tasks.add_task(realtime_service.send_user_event, student_id, "CLASS_ROSTER_CHANGED", payload)

@router.patch("/semesters/{semester_id}", response_model=SemesterResponse)
def update_semester(semester_id: int, data: SemesterUpdate, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    from app.models.course import Semester, SemesterStatusEnum
    obj = db.get(Semester, semester_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Semester not found")
    changes = data.model_dump(exclude_unset=True)
    start = changes.get("start_date", obj.start_date)
    end = changes.get("end_date", obj.end_date)
    if end < start:
        raise HTTPException(status_code=422, detail="end_date must not be before start_date")
    if changes.get("status") == SemesterStatusEnum.ACTIVE:
        db.query(Semester).filter(Semester.id != semester_id, Semester.status == SemesterStatusEnum.ACTIVE).update({Semester.status: SemesterStatusEnum.PLANNED}, synchronize_session=False)
    for field, value in changes.items():
        setattr(obj, field, value)
    write_audit_log(db, action="SEMESTER_UPDATED", actor_user_id=current_user.id, entity_type="SEMESTER", entity_id=semester_id, details={"changes": list(changes.keys())})
    db.commit(); db.refresh(obj)
    return obj
@router.delete("/semesters/{semester_id}", status_code=204)
def delete_semester(semester_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    from app.models.course import Semester
    from app.models.course import ClassSection
    obj = db.get(Semester, semester_id)
    if not obj: raise HTTPException(status_code=404, detail="Semester not found")
    if db.query(ClassSection.id).filter(ClassSection.semester_id == semester_id).first():
        raise HTTPException(status_code=409, detail="Học kỳ đang có ca học, hãy xóa các ca học trước")
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
    from app.models.course import ClassSection
    obj = db.get(Course, course_id)
    if not obj: raise HTTPException(status_code=404, detail="Course not found")
    if db.query(ClassSection.id).filter(ClassSection.course_id == course_id).first():
        raise HTTPException(status_code=409, detail="Môn học đang có ca học, hãy xóa các ca học trước")
    db.delete(obj); db.commit()

@router.patch("/sections/{section_id}", response_model=ClassSectionResponse)
def update_section(section_id: int, data: ClassSectionUpdate, db: Session = Depends(dependencies.get_db), current_user=Depends(require_staff)):
    from app.models.user import Lecturer
    obj = dependencies.require_section_access(db, section_id, current_user)
    changes = data.model_dump(exclude_unset=True)
    if "section_code" in changes and changes["section_code"]:
        changes["section_code"] = changes["section_code"].strip().upper()
    new_lecturer = changes.get("lecturer_id")
    if new_lecturer is not None and new_lecturer != obj.lecturer_id:
        if current_user.role != RoleEnum.ADMIN:
            raise HTTPException(status_code=403, detail="Chỉ quản trị viên được đổi giảng viên phụ trách")
        if db.get(Lecturer, new_lecturer) is None:
            raise HTTPException(status_code=422, detail="Giảng viên không tồn tại")
    else:
        changes.pop("lecturer_id", None)
    for field, value in changes.items():
        if value is not None:
            setattr(obj, field, value)
    write_audit_log(db, action="CLASS_UPDATED", actor_user_id=current_user.id, entity_type="CLASS_SECTION", entity_id=section_id, details={"section_code": obj.section_code})
    if "lecturer_id" in changes:
        _notify_assignment(db, obj, current_user.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Mã ca học đã tồn tại trong học kỳ này")
    db.refresh(obj); return obj

@router.delete("/sections/{section_id}", status_code=204)
def delete_section(section_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(require_admin)):
    from app.models.course import ClassSection
    dependencies.require_section_access(db, section_id, current_user)
    obj = db.get(ClassSection, section_id)
    if not obj: raise HTTPException(status_code=404, detail="Section not found")
    code = obj.section_code
    from app.models.attendance import AttendanceRecord, AttendanceSession
    if db.query(AttendanceRecord.id).join(AttendanceSession).filter(AttendanceSession.section_id == section_id).first():
        raise HTTPException(status_code=409, detail="Ca học đã có dữ liệu điểm danh, không thể xóa")
    notifications.notify(
        db, notifications.others(notifications.section_student_ids(db, section_id) + [obj.lecturer_id], current_user.id),
        "SECTION_DELETED", f"Ca học {notifications.section_label(obj)} đã bị xóa", link="/schedule",
    )
    db.delete(obj)
    write_audit_log(db, action="CLASS_DELETED", actor_user_id=current_user.id, entity_type="CLASS_SECTION", entity_id=section_id, details={"section_code": code})
    db.commit()


@router.post("/sections/{section_id}/classes/{class_code}")
def enroll_administrative_class(
    section_id: int,
    class_code: str,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(require_staff),
):
    dependencies.require_section_access(db, section_id, current_user)
    from app.models.course import ClassSection
    from app.models.user import Student
    section = db.get(ClassSection, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    students = db.query(Student).filter(Student.administrative_class == class_code.strip()).all()
    if not students:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy sinh viên nào thuộc lớp {class_code}")

    existing_enrolled = {
        e.student_id for e in db.query(Enrollment.student_id).filter(Enrollment.section_id == section_id).all()
    }

    added = [s.user_id for s in students if s.user_id not in existing_enrolled]
    for student_id in added:
        db.add(Enrollment(section_id=section_id, student_id=student_id, status=EnrollmentStatusEnum.ENROLLED))
    added_count = len(added)

    if added_count > 0:
        _notify_roster(db, section, added, added=True)
        write_audit_log(
            db, action="ADMINISTRATIVE_CLASS_ENROLLED", actor_user_id=current_user.id,
            entity_type="CLASS_SECTION", entity_id=section_id,
            details={"section_id": section_id, "class_code": class_code, "enrolled_count": added_count}
        )
        db.commit()

    return {"class_code": class_code, "added_count": added_count, "total_class_students": len(students)}


@router.delete("/sections/{section_id}/classes/{class_code}", status_code=204)
def unenroll_administrative_class(
    section_id: int,
    class_code: str,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(require_staff),
):
    dependencies.require_section_access(db, section_id, current_user)
    from app.models.user import Student
    student_ids = [
        s.user_id for s in db.query(Student.user_id).filter(Student.administrative_class == class_code.strip()).all()
    ]
    if student_ids:
        enrolled = [
            row.student_id for row in db.query(Enrollment.student_id).filter(
                Enrollment.section_id == section_id, Enrollment.student_id.in_(student_ids)
            ).all()
        ]
        _notify_roster(db, dependencies.get_section_or_404(db, section_id), enrolled, added=False)
        deleted = db.query(Enrollment).filter(
            Enrollment.section_id == section_id,
            Enrollment.student_id.in_(student_ids)
        ).delete(synchronize_session=False)
        write_audit_log(
            db, action="ADMINISTRATIVE_CLASS_UNENROLLED", actor_user_id=current_user.id,
            entity_type="CLASS_SECTION", entity_id=section_id,
            details={"section_id": section_id, "class_code": class_code, "removed_count": deleted}
        )
        db.commit()


@router.get("/courses/{course_id}/classes", response_model=list[ClassSectionResponse])
def list_subject_classes(course_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_staff)):
    from app.models.course import ClassSection
    return db.query(ClassSection).join(SubjectClass, SubjectClass.section_id == ClassSection.id).filter(SubjectClass.course_id == course_id).all()


@router.post("/courses/{course_id}/classes/{section_id}", response_model=ClassSectionResponse, status_code=201)
def add_class_to_subject(course_id: int, section_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(require_staff)):
    from app.models.course import Course, ClassSection
    course = db.get(Course, course_id)
    section = db.get(ClassSection, section_id)
    if not course or not section:
        raise HTTPException(status_code=404, detail="Subject or class not found")
    if current_user.role == RoleEnum.LECTURER:
        dependencies.require_section_access(db, section_id, current_user)
    if db.query(SubjectClass).filter_by(course_id=course_id, section_id=section_id).first():
        raise HTTPException(status_code=409, detail="Class is already assigned to this subject")
    db.add(SubjectClass(course_id=course_id, section_id=section_id))
    write_audit_log(db, action="CLASS_ASSIGNED_TO_SUBJECT", actor_user_id=current_user.id, entity_type="COURSE", entity_id=course_id, details={"section_id": section_id})
    db.commit(); db.refresh(section)
    return section


@router.delete("/courses/{course_id}/classes/{section_id}", status_code=204)
def remove_class_from_subject(course_id: int, section_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(require_staff)):
    link = db.query(SubjectClass).filter_by(course_id=course_id, section_id=section_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Class is not assigned to this subject")
    if current_user.role == RoleEnum.LECTURER:
        dependencies.require_section_access(db, section_id, current_user)
    db.delete(link)
    write_audit_log(db, action="CLASS_REMOVED_FROM_SUBJECT", actor_user_id=current_user.id, entity_type="COURSE", entity_id=course_id, details={"section_id": section_id})
    db.commit()


@router.get("/sections/{section_id}/overview")
def section_overview(section_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(require_staff)):
    """Everything the ca-hoc detail screen shows: classes with head counts and the sessions."""
    from app.models.attendance import AttendanceRecord, AttendanceSession
    from app.models.user import Student, User
    from sqlalchemy import func
    section = dependencies.require_section_access(db, section_id, current_user)
    rows = (
        db.query(Student.user_id, Student.student_code, Student.administrative_class, User.full_name)
        .join(Enrollment, Enrollment.student_id == Student.user_id)
        .join(User, User.id == Student.user_id)
        .filter(Enrollment.section_id == section_id, Enrollment.status == EnrollmentStatusEnum.ENROLLED)
        .order_by(Student.administrative_class, Student.student_code)
        .all()
    )
    names = {c.code: c.name for c in db.query(AdministrativeClass).all()}
    groups: dict[str, dict] = {}
    for row in rows:
        code = row.administrative_class or ""
        group = groups.setdefault(code, {"code": code, "name": names.get(code), "students": []})
        group["students"].append({"id": row.user_id, "student_code": row.student_code, "full_name": row.full_name})
    for group in groups.values():
        group["student_count"] = len(group["students"])

    counts = dict(
        db.query(AttendanceRecord.session_id, func.count(AttendanceRecord.id))
        .join(AttendanceSession)
        .filter(AttendanceSession.section_id == section_id)
        .group_by(AttendanceRecord.session_id)
        .all()
    )
    sessions = db.query(AttendanceSession).filter(AttendanceSession.section_id == section_id).order_by(
        AttendanceSession.scheduled_start_at, AttendanceSession.session_no
    ).all()
    iso = lambda value: value.isoformat() + "Z" if value else None
    lecturer = db.get(User, section.lecturer_id)
    return {
        "id": section.id,
        "section_code": section.section_code,
        "room": section.room,
        "status": section.status.value,
        "course": {"id": section.course.id, "code": section.course.course_code, "name": section.course.course_name},
        "semester": {"id": section.semester.id, "code": section.semester.code, "start_date": section.semester.start_date.isoformat(), "end_date": section.semester.end_date.isoformat()},
        "lecturer": {"id": section.lecturer_id, "full_name": lecturer.full_name if lecturer else None},
        "student_count": len(rows),
        "classes": sorted(groups.values(), key=lambda g: (g["code"] == "", g["code"])),
        "sessions": [
            {
                "id": x.id, "session_no": x.session_no, "title": x.title, "status": x.status.value,
                "scheduled_start_at": iso(x.scheduled_start_at), "scheduled_end_at": iso(x.scheduled_end_at),
                "late_after_at": iso(x.late_after_at), "record_count": counts.get(x.id, 0),
            }
            for x in sessions
        ],
    }

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import dependencies
from app.crud import crud_student
from app.models.user import RoleEnum, UserStatusEnum
from app.schemas.user import StudentCreate, StudentProfileCreate, StudentProfileResponse

router = APIRouter()
require_admin = dependencies.require_role([RoleEnum.ADMIN.value])
require_staff = dependencies.require_role([RoleEnum.ADMIN.value, RoleEnum.LECTURER.value])


@router.get('/', response_model=list[StudentProfileResponse])
def list_students(skip: int = 0, limit: int = 50, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_staff)):
    return crud_student.get_all_students(db, skip=skip, limit=min(limit, 100))


@router.get('/{student_id}', response_model=StudentProfileResponse)
def get_student(student_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_staff)):
    student = crud_student.get_student_by_id(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    return student


@router.post('/', response_model=StudentProfileResponse, status_code=status.HTTP_201_CREATED)
def create_student(data: StudentCreate, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    return crud_student.create_student(db, user_in=data, profile_in=data.student)


@router.patch('/{student_id}', response_model=StudentProfileResponse)
def update_student(student_id: int, profile: StudentProfileCreate, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    student = crud_student.get_student_by_id(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    for field, value in profile.model_dump().items():
        setattr(student, field, value)
    db.commit(); db.refresh(student)
    return student


@router.patch('/{student_id}/lock', response_model=StudentProfileResponse)
def lock_student(student_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    student = crud_student.get_student_by_id(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    return crud_student.update_student_status(db, student, UserStatusEnum.LOCKED)


@router.delete('/{student_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_student(student_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    student = crud_student.get_student_by_id(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    db.delete(student.user); db.commit()
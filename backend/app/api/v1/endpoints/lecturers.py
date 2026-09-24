from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import dependencies
from app.crud import crud_lecturer
from app.models.user import RoleEnum
from app.schemas.user import LecturerCreate, LecturerProfileCreate, LecturerProfileResponse
router = APIRouter()
require_admin = dependencies.require_role([RoleEnum.ADMIN.value])
require_staff = dependencies.require_role([RoleEnum.ADMIN.value, RoleEnum.LECTURER.value])
@router.get('/', response_model=list[LecturerProfileResponse])
def list_lecturers(skip: int = 0, limit: int = 50, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_staff)):
    return crud_lecturer.get_all_lecturers(db, skip=skip, limit=min(limit, 100))
@router.get('/{lecturer_id}', response_model=LecturerProfileResponse)
def get_lecturer(lecturer_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_staff)):
    lecturer = crud_lecturer.get_lecturer_by_id(db, lecturer_id)
    if not lecturer: raise HTTPException(status_code=404, detail='Lecturer not found')
    return lecturer
@router.post('/', response_model=LecturerProfileResponse, status_code=status.HTTP_201_CREATED)
def create_lecturer(data: LecturerCreate, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    return crud_lecturer.create_lecturer(db, user_in=data, profile_in=data.lecturer)
@router.patch('/{lecturer_id}', response_model=LecturerProfileResponse)
def update_lecturer(lecturer_id: int, profile: LecturerProfileCreate, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    lecturer = crud_lecturer.get_lecturer_by_id(db, lecturer_id)
    if not lecturer: raise HTTPException(status_code=404, detail='Lecturer not found')
    for field, value in profile.model_dump().items(): setattr(lecturer, field, value)
    db.commit(); db.refresh(lecturer); return lecturer
@router.delete('/{lecturer_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_lecturer(lecturer_id: int, db: Session = Depends(dependencies.get_db), _: Any = Depends(require_admin)):
    lecturer = crud_lecturer.get_lecturer_by_id(db, lecturer_id)
    if not lecturer: raise HTTPException(status_code=404, detail='Lecturer not found')
    db.delete(lecturer.user); db.commit()
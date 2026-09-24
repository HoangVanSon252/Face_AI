from fastapi import APIRouter
from app.api.v1.endpoints import auth, students, lecturers, courses

api_router = APIRouter()

# Auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Users – quản lý theo role
api_router.include_router(students.router,  prefix="/students",  tags=["students"])
api_router.include_router(lecturers.router, prefix="/lecturers", tags=["lecturers"])
api_router.include_router(courses.router,   prefix="/academic",  tags=["academic"])

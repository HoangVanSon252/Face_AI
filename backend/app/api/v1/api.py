from fastapi import APIRouter
from app.api.v1.endpoints import attendance, audit, auth, reports, sessions, students, lecturers, courses, users, ws

api_router = APIRouter()

# Auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Users – quản lý theo role
api_router.include_router(students.router,  prefix="/students",  tags=["students"])
api_router.include_router(lecturers.router, prefix="/lecturers", tags=["lecturers"])
api_router.include_router(courses.router,   prefix="/academic",  tags=["academic"])
api_router.include_router(users.router,     prefix="/users",     tags=["users"])
api_router.include_router(sessions.router, tags=["sessions"])
api_router.include_router(attendance.router, tags=["attendance"])
api_router.include_router(reports.router, tags=["reports"])
api_router.include_router(audit.router, tags=["audit"])
api_router.include_router(ws.router, tags=["websocket"])

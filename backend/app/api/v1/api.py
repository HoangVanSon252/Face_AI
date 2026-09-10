from fastapi import APIRouter
from app.api.v1.endpoints import users

api_router = APIRouter()

# Đăng ký các router con vào router chính
api_router.include_router(users.router, prefix="/users", tags=["users"])

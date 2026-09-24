from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

def setup_middlewares(app: FastAPI) -> None:
    # Đọc danh sách origins từ config (comma-separated trong .env)
    origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,          # Bắt buộc để browser gửi cookie
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-CSRF-Token",              # Cho phép header CSRF
            "X-Request-ID",
        ],
        expose_headers=["X-Request-ID"],
    )

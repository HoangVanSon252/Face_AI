from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

def setup_middlewares(app: FastAPI) -> None:
    # Danh sách các domain được phép gọi API
    origins = [
        "http://localhost",
        "http://localhost:5173",
    ]

    # Cấu hình CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


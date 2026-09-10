from fastapi import FastAPI
from app.core.config import settings
from app.core.middleware import setup_middlewares
from app.api.v1.api import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Kích hoạt toàn bộ middlewares
setup_middlewares(app)

# Tích hợp toàn bộ router (gom từ thư mục endpoints)
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {"message": "Welcome to Face Attendance API"}

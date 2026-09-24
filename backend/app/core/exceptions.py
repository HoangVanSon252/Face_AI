from typing import List, Optional
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi import Request, status
from datetime import datetime

# Lớp Exception tùy chỉnh để ném ra các lỗi có kiểm soát trong hệ thống
class APIException(Exception):
    def __init__(self, status_code: int, code: str, message: str, error: Optional[List] = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.error = error

# Đăng ký các Handler bắt lỗi tập trung (Global Exception Handling)
def setup_exception_handler(app):
    @app.exception_handler(APIException)
    async def api_exception_handler(request: Request, exc: APIException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "code": exc.code,
                "message": exc.message,
                "data": None,
                "error": exc.error,
                "time_stamp": datetime.now().isoformat()
            }
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                "success": False,
                "code": "VALIDATION_ERROR",
                "message": "Dữ liệu không hợp lệ",
                "data": None,
                "error": {
                    "type": exc.errors()[0]["type"],
                    "message": exc.errors()[0]["msg"]
                },
            }
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "code": "HTTP_EXCEPTION",
                "message": exc.detail,
                "data": None,
                "error": None
            }
        )

    @app.exception_handler(Exception)
    async def exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Đã có lỗi xảy ra",
                "data": None,
                "error": str(exc) # Ghi nhận lỗi chi tiết ở server, có thể giấu đi ở production
            }
        )

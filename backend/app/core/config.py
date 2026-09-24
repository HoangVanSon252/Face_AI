from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Face Attendance AI"
    API_V1_STR: str = "/api/v1"
    
    # JWT Config
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15          # 15 phút (ngắn để an toàn)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Security
    CSRF_SECRET_KEY: str = "change-me-csrf-secret" # Đổi trong .env
    COOKIE_SECURE: bool = False                    # True khi production (HTTPS)
    COOKIE_SAMESITE: str = "lax"                   # "strict" khi production
    ALLOWED_ORIGINS: str = "http://localhost:5173"  # Comma-separated

    # Rate Limiting
    RATE_LIMIT_LOGIN: str = "5/minute"             # 5 lần login/phút
    RATE_LIMIT_REGISTER: str = "3/minute"          # 3 lần register/phút
    RATE_LIMIT_REFRESH: str = "10/minute"          # 10 lần refresh/phút
    
    # Database
    MYSQL_USER: str
    MYSQL_PASSWORD: str
    MYSQL_HOST: str
    MYSQL_PORT: str
    MYSQL_DB: str
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DB}"

    # Redis
    REDIS_URL: str

    class Config:
        env_file = "../.env"
        case_sensitive = True

settings = Settings()

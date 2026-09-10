from typing import Generator
from app.database import SessionLocal

# Dependency lấy Database Session
def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

# Nơi đây sẽ thêm get_current_user sau khi làm Authentication

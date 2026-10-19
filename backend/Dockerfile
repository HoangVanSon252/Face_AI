FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

# Cài đặt hệ thống cần thiết (nếu có sau này)
# Cài đặt thư viện Python
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Khởi động: update DB → seed data → chạy API
CMD ["sh", "-c", "until python -c 'from app.database import engine; connection = engine.connect(); connection.close()'; do echo 'Waiting for MySQL...'; sleep 2; done; alembic upgrade head; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

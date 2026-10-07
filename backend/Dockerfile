FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

# Cài đặt hệ thống cần thiết (nếu có sau này)
# Cài đặt thư viện Python
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Khởi động: update DB → chạy API
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
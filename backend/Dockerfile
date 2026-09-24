FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

# Cài đặt hệ thống cần thiết
# Tải và setup Redis từ Docker Hub
RUN curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" > /etc/apt/sources.list.d/redis.list \
    && apt-get update \
    && apt-get install -y redis-server

# Cài đặt thư viện Python
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Khởi động: update DB → chạy API
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
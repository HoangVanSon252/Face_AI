"""
Rate Limiter – Sử dụng slowapi (wrapper của limits cho FastAPI)
Áp dụng: Giới hạn số request trên các endpoint nhạy cảm (login, register, refresh)
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Key mặc định: IP address của client
# Trong production sau reverse proxy, cần cấu hình thêm X-Forwarded-For
limiter = Limiter(key_func=get_remote_address)

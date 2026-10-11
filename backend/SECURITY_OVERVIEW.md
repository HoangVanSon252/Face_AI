# Security Overview

Tài liệu này mô tả các cơ chế bảo mật hiện có trong backend, vị trí thực thi và ý nghĩa. Số dòng được tính theo phiên bản mã hiện tại.

## 1. Cấu hình an toàn theo môi trường

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| Cấu hình từ environment | `app/core/config.py:7-16` | Dùng `BaseSettings` và đọc `.env`; secret, DB và Redis không hard-code trong mã nguồn. |
| Phân biệt môi trường | `app/core/config.py:17-18` | `ENVIRONMENT` chỉ nhận `development`, `test`, `production`; `DEBUG` được parse an toàn, gồm cả giá trị `release` thành `False`. |
| Secret bắt buộc | `app/core/config.py:20-21` | `SECRET_KEY` và `CSRF_SECRET_KEY` là biến bắt buộc khi khởi động. |
| CORS/host/request limit config | `app/core/config.py:26-30` | Origin, host được phép và kích thước request tối đa được cấu hình từ environment. |
| Production fail-fast | `app/core/config.py:80-104` | Khi `ENVIRONMENT=production`, app không khởi động nếu JWT/CSRF secret yếu, `COOKIE_SECURE=false`, hoặc CORS dùng `*`. |
| Mẫu biến môi trường | `.env.example:1-30` | Cung cấp danh sách biến cần cấu hình, không dùng làm secret production. |
| Docker bắt buộc secret | `../docker-compose.yml:38-46` | Compose yêu cầu `MYSQL_PASSWORD`, `SECRET_KEY`, `CSRF_SECRET_KEY`; production bật `COOKIE_SECURE=true`. |

## 2. Authentication và password

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| Password hashing | `app/core/security.py:19-25` | Password được hash/verify bằng `bcrypt`; database chỉ lưu `password_hash`. |
| JWT access token | `app/core/security.py:7-16` | Token chứa `sub` và `exp`, được ký bằng `SECRET_KEY` với thuật toán cấu hình. |
| Xác thực Bearer token | `app/api/dependencies.py:12, 26-46` | `OAuth2PasswordBearer` đọc token; backend verify signature, algorithm, subject và user tồn tại. Token sai trả `401`. |
| User active check | `app/api/dependencies.py:50-55` | User `INACTIVE` hoặc `LOCKED` không được gọi API bảo vệ. |
| Login rate limit | `app/api/v1/endpoints/auth.py:34` | Login bị giới hạn theo cấu hình `RATE_LIMIT_LOGIN`. |
| Refresh rate limit | `app/api/v1/endpoints/auth.py:133` | Refresh token bị giới hạn theo cấu hình `RATE_LIMIT_REFRESH`. |

## 3. Refresh token, cookie và CSRF

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| Token hash trong DB | `app/crud/crud_user.py:58-74`, `app/models/token.py:11` | Refresh token thô không lưu database; chỉ SHA-256 hash được lưu và truy vấn. |
| Token rotation | `app/api/v1/endpoints/auth.py:183-211` | Khi refresh thành công, token cũ bị revoke và token mới được tạo trong cùng transaction với audit log. |
| Phát hiện token reuse | `app/api/v1/endpoints/auth.py:156-176` | Dùng refresh token đã revoke sẽ revoke toàn bộ token của user, ghi audit rồi trả `401`. |
| HttpOnly refresh cookie | `app/core/csrf.py:62-72` | Refresh token được đặt `HttpOnly`, `Secure` theo config, `SameSite` theo config, và chỉ gửi tới endpoint refresh. Điều này giảm nguy cơ XSS đánh cắp refresh token. |
| Double-submit CSRF | `app/core/csrf.py:32-47` | Header `X-CSRF-Token` phải bằng cookie `csrf_token`; dùng `hmac.compare_digest` chống timing attack. |
| CSRF tại refresh endpoint | `app/api/v1/endpoints/auth.py:140` | `POST /auth/refresh` bắt buộc qua `verify_csrf_token`. |
| Logout/revoke cookie | `app/api/v1/endpoints/auth.py:218-248`, `app/core/csrf.py:87-90` | Logout revoke refresh token hiện tại và xóa cả refresh/CSRF cookie. |

### Lưu ý

`CSRF_SECRET_KEY` hiện được kiểm tra ở production tại `app/core/config.py:94-95`, nhưng chưa được dùng để ký token CSRF. Cơ chế hiện tại là double-submit cookie ngẫu nhiên; đây không phải lỗi chức năng, nhưng nếu muốn signed CSRF token thì cần triển khai ở một task hardening tiếp theo.

## 4. Authorization và ownership

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| RBAC | `app/api/dependencies.py:58-66` | `require_role()` giới hạn endpoint theo role `ADMIN`, `LECTURER`, `STUDENT`. |
| User ownership | `app/api/v1/endpoints/users.py:24-28` | User chỉ đọc được dữ liệu của chính mình, trừ Admin. |
| Section ownership | `app/api/dependencies.py:94-105` | Admin được truy cập mọi section; lecturer chỉ truy cập section có `lecturer_id` bằng user hiện tại. |
| Student ownership | `app/api/dependencies.py:108-131` | Admin truy cập mọi student; student chỉ truy cập chính mình; lecturer chỉ truy cập student enrolled trong section mình phụ trách. |
| Áp dụng section ownership | `app/api/v1/endpoints/courses.py:75-82` | Xem enrollment của section cần qua `require_section_access()`. |
| Áp dụng student ownership | `app/api/v1/endpoints/students.py:31-42` | Xem profile student cần qua `require_student_access()`. |
| Lecturer chỉ thấy lớp mình | `app/api/v1/endpoints/courses.py:45-53`, `app/crud/crud_course.py:69-78` | Khi list section, lecturer tự động bị filter theo `lecturer_id`. |
| Lecturer chỉ thấy roster của mình | `app/api/v1/endpoints/students.py:16-29`, `app/crud/crud_student.py:23-44` | Danh sách student của lecturer được giới hạn bằng enrollment/section do lecturer phụ trách. |

## 5. HTTP perimeter: CORS, host, headers và request size

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| Trusted hosts | `app/core/middleware.py:59-63` | Chặn request có HTTP `Host` không nằm trong `ALLOWED_HOSTS`, giảm Host-header attack. |
| CORS allowlist | `app/core/middleware.py:66-78` | Chỉ origin trong `ALLOWED_ORIGINS` mới gọi cross-origin; chỉ cho phép HTTP method/header cần thiết và có credentials. |
| Security headers | `app/core/middleware.py:10-28` | Thêm `nosniff`, chống iframe, hạn chế referrer, quyền browser, CSP; thêm HSTS khi production. |
| Request body limit | `app/core/middleware.py:31-56` | Dựa vào `Content-Length`; request vượt `MAX_REQUEST_BODY_SIZE` trả `413`. |

## 6. Rate limiting và Redis

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| Shared rate-limit storage | `app/core/limiter.py:8-11` | SlowAPI lưu counter ở Redis qua `REDIS_URL`, nên nhiều backend instance dùng chung giới hạn. |
| Rate-limit handler | `app/main.py:17-19` | App đăng ký limiter và response handler khi quá giới hạn. |

## 7. Audit, privacy và error handling

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| Redact dữ liệu nhạy cảm | `app/services/audit_service.py:10-42` | Password, token, embedding, image bị thay bằng `[REDACTED]` trước khi ghi audit log. |
| Audit metadata | `app/services/audit_service.py:45-55` | Ghi IP và User-Agent; User-Agent giới hạn 500 ký tự. |
| Audit write | `app/services/audit_service.py:57-103` | Ghi `AuditLog`; mặc định chỉ `flush` để caller có thể commit cùng transaction. |
| Audit auth events | `app/api/v1/endpoints/auth.py:49-61, 68-80, 104-115, 164-173, 203-212, 237-246, 254-266` | Audit login failure/success, blocked login, token reuse, refresh, logout và xem current user. |
| Ẩn lỗi nội bộ | `app/core/exceptions.py:60-72` | Response `500` không còn trả chuỗi exception nội bộ về client. |

## 8. Database integrity controls

| Cơ chế | Vị trí | Hoạt động và ý nghĩa |
|---|---|---|
| Unique refresh token hash | `app/models/token.py:11` | Không cho hai record có cùng refresh token hash. |
| Unique enrollment | `app/models/course.py:101` | Một student chỉ có một enrollment trên mỗi section. |
| Unique section code/semester | `app/models/course.py:77` | Tránh section trùng mã trong cùng học kỳ. |
| Attendance uniqueness | `app/models/attendance.py:86` | Chặn duplicate attendance theo `(session_id, student_id)` khi attendance API được triển khai. |
| Attendance schedule constraints | `app/models/attendance.py:55-57` | Không cho thời gian session/late rule bất hợp lệ. |
| Score validation | `app/models/attendance.py:87-88`, `app/models/face.py:49` | Confidence, liveness, face quality chỉ nằm trong khoảng `0..1`. |

## 9. Tests bảo mật hiện có

| Test | Vị trí | Kiểm tra |
|---|---|---|
| Audit sanitization/transaction | `tests/test_audit_service.py` | Redact secret và audit service không tự commit mặc định. |
| Ownership | `tests/test_ownership.py` | Admin/lecturer/student không vượt ownership section và student profile. |
| Security middleware | `tests/test_security_middleware.py` | Security headers, request size limit và production cookie validation. |
| Route contract | `tests/test_route_contract.py` | Các route auth/users V1 được public đúng. |

Chạy test từ thư mục `backend`:

```powershell
.\venv\Scripts\python.exe -m pytest -q `
  --ignore=pytest-cache-files-fu3m570o `
  --ignore=pytest-cache-files-ujv88knc
```

## 10. Giới hạn hiện tại và việc cần làm tiếp

- Request-size middleware kiểm tra `Content-Length`; upload streaming/chunked cần một middleware/ASGI limit chặt hơn khi bổ sung upload ảnh.
- Chưa có attendance/review/appeal API, nên ownership cho các luồng đó sẽ được thêm ở các phase tương ứng.
- Chưa có liveness hoặc mã hóa embedding/image vì phạm vi AI đang tạm hoãn.
- Cần cấu hình `ALLOWED_HOSTS` và `ALLOWED_ORIGINS` theo domain thật trước production.
- HSTS chỉ đúng khi application luôn chạy sau HTTPS termination.
- Cảnh báo pytest cache hiện tại do cache folder cũ bị permission; không ảnh hưởng 10 test đang pass.

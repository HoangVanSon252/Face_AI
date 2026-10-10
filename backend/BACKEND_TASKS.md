# Backend Implementation Tasks

Phạm vi: hoàn thiện backend nghiệp vụ; AI/nhận diện khuôn mặt vẫn ngoài phạm vi.

Quy ước: `[x]` hoàn thành và đã kiểm tra; `[~]` đã có code nhưng cần integration/runtime verification; `[ ]` chưa triển khai.

Hiện tại: **14 test pass**, `compileall` và `git diff --check` pass. Docker Compose validation pass.

## Phase 0 — Chuẩn bị

- [x] Làm việc trên branch `backend`.
- [~] Working tree đang có các thay đổi chưa commit của các phase đã triển khai.
- [x] API prefix `/api/v1`.
- [x] Enum/state cho session, attendance và appeal đã có trong model.
- [~] Alembic migration tồn tại; chưa chạy trên MySQL sạch trong phiên này.
- [ ] Test database riêng cho integration test.

## Phase 1 — Cấu hình và bảo mật nền tảng

- [x] Validate production secret, cookie và CORS khi startup.
- [x] Tách `development`, `test`, `production` qua `ENVIRONMENT`.
- [x] Cấu hình `COOKIE_SECURE`, `COOKIE_SAMESITE`, CORS, trusted hosts.
- [x] Security headers, HSTS production và request-size limit.
- [x] Rate limit dùng Redis.
- [x] CSRF cho refresh/logout dùng double-submit cookie.
- [x] Không trả exception nội bộ trong response 500.
- [x] JWT có `sub`, `iat`, `exp`, `type`, `jti`.
- [x] User locked/inactive bị chặn ngay qua DB lookup; refresh token bị revoke khi logout/reuse.
- [~] Database pool/connect timeout đã cấu hình; chưa có per-query timeout/database integration test.
- [~] Access token có hiệu lực tối đa 15 phút sau logout; chưa có deny-list access-token riêng.

## Phase 2 — Audit log backend

- [x] `audit_service.py`, redact password/token/embedding/image.
- [x] Audit login thành công/thất bại, blocked login, refresh, reuse, logout.
- [x] Audit session, attendance, review và appeal.
- [x] Audit log append-only; chỉ Admin có API đọc `/api/v1/audit-logs`.
- [~] Test sanitize và transaction behavior của service.
- [ ] Audit toàn bộ create/update/delete user, course, section và enrollment.
- [ ] Integration test ghi audit vào MySQL thật.

## Phase 3 — Authorization và ownership

- [x] Dependency current user, active-user, RBAC.
- [x] Lecturer chỉ truy cập section, session, roster và attendance thuộc section mình phụ trách.
- [x] Student chỉ xem attendance và tạo appeal của chính mình.
- [x] Check enrollment trước khi tạo attendance.
- [x] Chặn thao tác check-in khi session không `OPEN`.
- [~] Có unit test ownership; chưa có API integration test cho toàn bộ 401/403.

## Phase 4 — Attendance Session API

- [x] `POST /sections/{section_id}/sessions`.
- [x] `GET /sections/{section_id}/sessions`.
- [x] `GET /sessions/{session_id}`.
- [x] `POST /sessions/{session_id}/open`.
- [x] `POST /sessions/{session_id}/close`.
- [x] `POST /sessions/{session_id}/cancel`.
- [x] Unique `session_no`, lifecycle và open-session conflict validation.
- [x] Audit create/open/close/cancel.
- [~] Schema/route test pass; lifecycle integration test với MySQL chưa có.

## Phase 5 — Attendance Record API (manual/internal, không AI)

- [x] `POST /sessions/{session_id}/attendance` cho lecturer phụ trách.
- [x] Validate session `OPEN`, enrollment và late rule.
- [x] Unique `(session_id, student_id)` và lỗi `409 ALREADY_CHECKED_IN`.
- [x] Manual attendance mặc định `APPROVED`; audit event được ghi.
- [~] Transaction code đã có; chưa có concurrency test với MySQL.

## Phase 6 — Attendance query và manual update

- [x] `GET /sessions/{session_id}/attendance` có status filter/pagination.
- [x] `PATCH /attendance/{record_id}` cho staff có ownership.
- [x] Ghi reviewer/review timestamp khi manual update.
- [x] `GET /students/me/attendance`.

## Phase 7 — Review queue

- [x] `GET /sessions/{session_id}/review-queue`.
- [x] `POST /attendance/{record_id}/approve`.
- [x] `POST /attendance/{record_id}/reject`.
- [x] Chỉ record `PENDING` được review; audit review event.
- [~] Record PENDING hiện chờ nguồn AI/internal pipeline trong tương lai; chưa có workflow integration test.

## Phase 8 — Appeal/Complaint workflow

- [x] `POST /attendance/{record_id}/appeals` với ownership student.
- [x] `GET /appeals/me`, `GET /sessions/{session_id}/appeals`.
- [x] `POST /appeals/{appeal_id}/resolve`.
- [x] Approve appeal cập nhật attendance trong cùng transaction; có resolution note/audit.
- [~] Chưa có integration test rollback transaction.

## Phase 9 — Report và export

- [x] Report theo session và section.
- [x] CSV export giới hạn tối đa 10,000 record, không export dữ liệu sinh trắc/token.
- [x] Ownership kiểm tra trước report/export.
- [x] Filter report theo khoảng thời gian.
- [~] Chưa có test CSV/report permission integration.

## Phase 10 — WebSocket realtime

- [x] WebSocket `/ws/sessions/{session_id}` xác thực JWT và ownership.
- [x] Connection manager, ping/pong, disconnect cleanup.
- [x] Event `session_status` và `attendance_detected`.
- [x] Không gửi ảnh/embedding.
- [ ] Event `review_required` từ AI pipeline.
- [x] Redis pub/sub cho nhiều backend instance, có fallback local khi Redis unavailable.
- [~] Chưa có WebSocket integration test.

## Phase 11 — Logging, monitoring và vận hành

- [x] JSON structured logging, request ID, latency, method/path/status.
- [x] Không log password/token/embedding qua audit service.
- [x] `/health` và `/ready`; ready kiểm tra MySQL + Redis.
- [x] Database connection pool/pre-ping.
- [x] Docker production không tự chạy migration.
- [x] Graceful shutdown cho Redis realtime client và SQLAlchemy engine.
- [x] Backup/restore MySQL scripts cho host/container Linux.
- [~] Deployment cần chạy Alembic trong CI/CD hoặc migration job riêng.

## Phase 12 — Kiểm thử bắt buộc

- [x] Unit/contract tests: auth route, audit redact, ownership, security middleware, JWT claims, attendance schema/routes.
- [~] `14 passed` trên test suite hiện có.
- [ ] Auth login/refresh/logout integration test.
- [ ] MySQL integration test: session lifecycle, duplicate attendance, review, appeal rollback.
- [ ] Redis rate-limit/WebSocket integration test.
- [ ] SQL injection/input validation security test suite.
- [ ] Docker Compose full startup + migration verification.

## API đã thêm

- Sessions: `/sections/{section_id}/sessions`, `/sessions/{session_id}`, `/open`, `/close`, `/cancel`.
- Attendance: `/sessions/{session_id}/attendance`, `/attendance/{record_id}`, review queue/approve/reject.
- Appeals: `/attendance/{record_id}/appeals`, `/appeals/me`, `/appeals/{appeal_id}/resolve`.
- Reports: `/reports/sessions/{session_id}`, `/reports/sections/{section_id}`, `/export`.
- Audit: `/audit-logs` (Admin).
- WebSocket: `/ws/sessions/{session_id}?token=<access-token>`.

## Việc nên làm tiếp

1. Khởi động MySQL + Redis bằng Docker Compose.
2. Chạy Alembic trên database sạch.
3. Viết integration tests cho luồng session → attendance → appeal.
4. Thêm Redis pub/sub trước khi scale nhiều backend instance.

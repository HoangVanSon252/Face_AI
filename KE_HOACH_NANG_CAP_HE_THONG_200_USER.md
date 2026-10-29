# KẾ HOẠCH NÂNG CẤP HỆ THỐNG ĐIỂM DANH KHUÔN MẶT (EDUFACE AI)
**Mục tiêu: Đạt chuẩn E2E Production-Ready & chịu tải tối thiểu 200 người dùng đồng thời**

> Phiên bản 2 — đã đối chiếu với mã nguồn nhánh `backend` (cập nhật 29/10/2026).
> Thay đổi so với bản 1: định nghĩa lại mô hình tải, bổ sung các điểm nghẽn/lỗ hổng mới phát hiện, phần pháp lý dữ liệu sinh trắc học, và sắp xếp lại lộ trình theo nguyên tắc "đo trước — tối ưu rẻ trước — đổi kiến trúc sau".

---

# PHẦN 1: HIỆN TRẠNG & MỤC TIÊU

## 1.1. Kiến trúc hiện tại
Dự án đã có khung sườn module hóa tốt: Backend FastAPI, AI Service (InsightFace + ONNX Runtime) tách riêng, SeaweedFS (S3-compatible) lưu ảnh minh chứng, Redis cho Pub/Sub thời gian thực, MySQL lưu dữ liệu nghiệp vụ, Frontend React phục vụ qua Nginx.

Luồng xử lý hiện tại là **đồng bộ, chặn (synchronous blocking)**:

$$\text{Webcam} \xrightarrow{\text{Base64}} \text{Backend} \xrightarrow{\text{HTTP sync} \times 2} \text{AI Service (1 worker)} \;\; ; \;\; \text{Backend} \xrightarrow{\text{query toàn bộ embeddings}} \text{MySQL}$$

## 1.2. Mô hình tải thực tế (cần thống nhất trước khi tối ưu)
Mã nguồn cho thấy có **hai luồng tải khác nhau**, không phải "200 sinh viên cùng gửi ảnh nhận diện":

| Luồng | Ai gọi | Endpoint | Tần suất / client | Đặc điểm |
|---|---|---|---|---|
| **Điểm danh** | Giảng viên/STAFF (máy đặt tại lớp, camera hướng vào sinh viên) | `POST /faces/sessions/{id}/recognize` | 1 frame / 1,6s (`LiveSessionView.tsx:339`) | Tải tỉ lệ với **số phiên mở đồng thời**, mỗi request tốn 2 lượt suy luận AI |
| **Đăng ký khuôn mặt** | Sinh viên (máy cá nhân) | `POST /faces/detect-frame` + `POST /faces/students/{id}/enroll` | 1 frame / 0,85s (`FaceRegistrationView.tsx:293`) | Tải tỉ lệ với **số sinh viên đăng ký cùng lúc**, payload enroll 3–5 ảnh |

Ước lượng tải (CPU suy luận ~0,3s/lượt):
- **Kịch bản A — 10 lớp điểm danh song song**: $10 \times 0{,}625 \approx 6{,}3$ req/s × 2 lượt AI ≈ **3,8 CPU-giây/giây** → cần tối thiểu 4 core AI nếu giữ nguyên 2 lượt gọi; chỉ còn ~1,9 nếu gộp thành 1 lượt.
- **Kịch bản B — 200 sinh viên đăng ký cùng lúc** (đầu học kỳ): $200 / 0{,}85 \approx 235$ req/s, ~300KB/frame ≈ **70 MB/s (~560 Mbps) upload** → không khả thi nếu giữ polling phía server.

## 1.3. Chỉ tiêu SLA
| Chỉ tiêu | Kịch bản A (điểm danh) | Kịch bản B (đăng ký) |
|---|---|---|
| Quy mô | ≥ 10 phiên song song, 200 sinh viên điểm danh trong 5 phút đầu giờ | 200 sinh viên đăng ký đồng thời |
| Độ trễ E2E | p95 ≤ 1,5s / lượt nhận diện | p95 ≤ 3s / lượt enroll |
| Tỷ lệ lỗi (5xx + timeout) | < 0,1% | < 0,1% |
| Bảo mật | Chống ảnh in 2D / video màn hình; token thu hồi được; WS không lộ JWT | Có consent trước khi thu thập sinh trắc học |

---

# PHẦN 2: CÁC VẤN ĐỀ CẦN NÂNG CẤP

## 2.1. Điểm nghẽn hiệu năng

### P1. AI Service chạy 1 worker, không giới hạn luồng ONNX *(nghiêm trọng)*
- `ai_service/Dockerfile`: `uvicorn app.main:app` — mặc định 1 tiến trình.
- Thông lượng tối đa ≈ $1/0{,}3 \approx 3{,}3$ lượt suy luận/giây. Với `AI_SERVICE_TIMEOUT_SECONDS = 30.0` (`backend/app/core/config.py:54`), khi hàng đợi dài hơn ~100 lượt các request phía sau sẽ timeout (503/504).
- Lưu ý khi tăng worker: mỗi tiến trình nạp InsightFace tốn ~0,5–1GB RAM; ONNX Runtime mặc định dùng **mọi** core cho mỗi phiên suy luận → nhiều worker sẽ tranh luồng và chậm hơn nếu không giới hạn `intra_op_num_threads`.

### P2. Mỗi lượt nhận diện gọi AI Service hai lần *(mới phát hiện)*
- `faces.py:139` gọi `extract_embedding()`, sau đó `faces.py:151` gọi `check_liveness()` với **cùng một ảnh**.
- AI Service phải decode base64 + phát hiện khuôn mặt hai lần → **lãng phí ~50% CPU AI** và gấp đôi độ trễ mạng nội bộ.

### P3. Polling Base64 khi đăng ký khuôn mặt (self-DDoS)
- `FaceRegistrationView.tsx:293`: `setInterval(checkPosition, 850)` — mỗi 850ms gửi 1 frame lên `detect-frame`, backend chuyển tiếp sang AI.
- Kịch bản B tạo ~235 req/s và ~560 Mbps upload (mục 1.2).

### P4. Event loop bị chặn trong endpoint `async def`
- `recognize` và `enroll_face_profile` khai báo `async def` nhưng bên trong toàn là thao tác **đồng bộ**:
  - `httpx.Client()` đồng bộ trong `backend/app/services/ai_client.py` (3 hàm: `extract_embedding`, `check_liveness`, `detect_faces_fast`), tạo client mới mỗi lần (không tái sử dụng kết nối).
  - Truy vấn SQLAlchemy `Session` đồng bộ.
  - Upload ảnh minh chứng lên SeaweedFS đồng bộ.
- Hậu quả: trong suốt thời gian chờ AI (~0,3–0,6s), **toàn bộ tiến trình backend** không phục vụ được request nào khác. Đây là lỗi nặng hơn việc dùng `def` thường (FastAPI tự đưa `def` vào threadpool).

### P5. Backend cũng chỉ 1 worker
- `backend/Dockerfile`: `exec uvicorn app.main:app` không có `--workers`. Kết hợp với P4, backend gần như xử lý tuần tự.

### P6. So khớp vector O(N) toàn trường bằng Python thuần
- `faces.py:171-172`: lấy **tất cả** embedding ACTIVE trong DB, tính cosine bằng vòng lặp Python, rồi mới kiểm tra sinh viên có thuộc lớp không (`faces.py:177`).
- 2.000 sinh viên × 5 mẫu = 10.000 vector 512 chiều phải kéo qua DB và tính tuần tự **cho mỗi frame**.
- Ngoài hiệu năng, việc so khớp toàn trường còn **tăng xác suất nhận nhầm** (false match) so với chỉ so trong danh sách lớp.

### P7. Connection pool nhỏ
- `config.py:48-50`: `DB_POOL_SIZE=10`, `DB_MAX_OVERFLOW=20`, `DB_POOL_TIMEOUT=30` → tối đa 30 kết nối/tiến trình.
- Lưu ý: khi tăng số worker backend, tổng kết nối = (pool + overflow) × số worker; phải tính cùng `max_connections` của MySQL.

## 2.2. Lỗ hổng bảo mật

### S1. Liveness fallback được bật mặc định khi chạy bằng docker-compose
- `ai_service/app/engine/liveness.py:62-64`: khi không có model ONNX **và** `ENVIRONMENT=development` **và** `DEBUG=true`, hệ thống dùng `det_score` (độ tự tin phát hiện mặt) làm điểm liveness.
- `docker-compose.yml` **hardcode** `DEBUG: "true"` cho `ai_service` và mặc định `ENVIRONMENT=development` → fallback luôn bật khi chạy compose.
- `det_score` của ảnh in hoặc ảnh trên màn hình điện thoại thường > 0,8 → **có thể giơ ảnh bạn khác để điểm danh hộ**.

### S2. Redis và MySQL mở cổng ra máy host, Redis không có mật khẩu *(mới phát hiện)*
- `docker-compose.yml` publish `6379:6379` (Redis, không `requirepass`) và `3307:3306` (MySQL) ra `0.0.0.0`.
- Bất kỳ máy nào cùng mạng LAN đều đọc/ghi được Redis — nghiêm trọng hơn khi Redis lưu token blacklist và WS ticket (giải pháp ở Phần 3).

### S3. Access token JWT không thu hồi được khi logout
- `auth.py` logout chỉ xóa refresh token + cookie; access token (15 phút) vẫn dùng được nếu đã bị lộ.

### S4. JWT lộ qua query string của WebSocket
- `ws.py`: `ws://.../ws/sessions/{id}?token=eyJ...` → token nằm trong access log của Nginx/proxy và lịch sử trình duyệt.

### S5. CSRF token không ký HMAC
- `CSRF_SECRET_KEY` có trong `.env` nhưng `backend/app/core/csrf.py` chỉ so khớp chuỗi ngẫu nhiên (plain double-submit).

### S6. Không giới hạn kích thước và tần suất ảnh gửi lên *(mới phát hiện)*
- Schema `image_base64: str = Field(min_length=100)` — **không có `max_length`** → có thể gửi payload hàng chục MB làm cạn RAM backend/AI.
- Rate limit mới áp dụng cho login/register/refresh (`config.py:35-37`), **chưa áp dụng** cho `detect-frame` và `recognize` — chính là hai endpoint đắt nhất.

### S7. Chưa có HTTPS *(mới phát hiện — chặn triển khai thực tế)*
- Trình duyệt chỉ cho phép `getUserMedia` (camera) trên `localhost` hoặc HTTPS. Truy cập qua IP LAN / domain bằng HTTP → **camera không mở được** trên máy giảng viên và sinh viên.
- Cookie `COOKIE_SECURE` đang mặc định `false`.

## 2.3. Hạn chế vận hành *(mới bổ sung)*

| # | Vấn đề | Vị trí |
|---|---|---|
| O1 | Nginx giữ `client_max_body_size` mặc định **1MB** → enroll 3–5 ảnh (~0,9–1,5MB) có thể bị `413 Request Entity Too Large` | `frontend/nginx.conf` |
| O2 | WebSocket qua Nginx dùng `proxy_read_timeout` mặc định 60s → kết nối idle bị cắt | `frontend/nginx.conf` |
| O3 | Image `chrislusf/seaweedfs:latest` không ghim phiên bản → build có thể hỏng bất kỳ lúc nào | `docker-compose.yml` |
| O4 | Không có metrics/tracing → không đo được p95 để nghiệm thu SLA | toàn hệ thống |
| O5 | Có script `backend/scripts/backup-mysql.sh` nhưng chưa có lịch tự động, chính sách lưu giữ, và chưa backup bucket ảnh minh chứng | vận hành |
| O6 | Healthcheck MySQL truyền mật khẩu qua dòng lệnh (`-p$$MYSQL_ROOT_PASSWORD`), backend kết nối DB bằng `root` | `docker-compose.yml` |

## 2.4. Hạn chế UI/UX

- **U1. Không có router**: `App.tsx` dùng `useState<View>('Tổng quan')` → F5 mất trang hiện tại, không dùng được Back/Forward, không có deep-link tới phiên điểm danh.
- **U2. Thiếu phản hồi trực quan trên video**: chỉ có text/toast, chưa có khung nhận diện vẽ trên webcam.
- **U3. Hardcode phân trang**: `frontend/src/services/adminUsers.ts` gọi `/api/v1/users/?limit=100` → người dùng thứ 101 trở đi không hiển thị.
- **U4. WebSocket không tự kết nối lại** khi Wi-Fi giảng đường chập chờn.

## 2.5. Tuân thủ pháp lý về dữ liệu sinh trắc học *(mới bổ sung)*
Theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân, dữ liệu khuôn mặt (sinh trắc học) là **dữ liệu cá nhân nhạy cảm**; cần rà soát thêm với Luật Bảo vệ dữ liệu cá nhân (hiệu lực từ 01/01/2026) cùng bộ phận pháp chế của trường. Hệ thống hiện **chưa có**:
- Màn hình xin đồng ý (consent) rõ ràng trước khi thu thập khuôn mặt, và bản ghi lưu thời điểm/phiên bản điều khoản đã đồng ý.
- Chức năng cho sinh viên yêu cầu xóa hồ sơ khuôn mặt.
- Chính sách thời hạn lưu ảnh minh chứng điểm danh và cơ chế tự động xóa.
- Mã hóa `embedding_data` khi lưu trữ (at-rest) và nhật ký truy cập (audit log) mỗi lần xem ảnh minh chứng.

---

# PHẦN 3: GIẢI PHÁP CHI TIẾT

Nguyên tắc: **làm các tối ưu rẻ, rủi ro thấp trước → đo bằng load test → chỉ đổi kiến trúc (Queue) khi số liệu cho thấy cần.**

## 3.1. Hiệu năng

### G1. Gộp hai lượt gọi AI thành một endpoint `/analyze` *(giải quyết P2 — ưu tiên cao nhất, chi phí thấp nhất)*
- AI Service thêm `POST /analyze`: decode ảnh 1 lần, detect 1 lần, trả về đồng thời `embedding`, `quality_score`, `bbox`, `is_live`, `liveness_score`.
- Backend `recognize` chỉ gọi 1 lần. Nếu `is_live = false` thì dừng, không so khớp.
- Hiệu quả dự kiến: giảm ~50% CPU AI và ~1 round-trip mạng mỗi lượt.

### G2. Gỡ chặn event loop *(giải quyết P4)*
- **Bước nhanh (làm ngay)**: đổi `async def recognize` / `async def enroll_face_profile` thành `def`. FastAPI sẽ chạy chúng trong threadpool nên DB, upload và HTTP đồng bộ không còn chặn event loop.
- Tái sử dụng kết nối: tạo một `httpx.Client` dùng chung (khởi tạo trong lifespan của app, có `limits` cho connection pool) thay vì `with httpx.Client()` mỗi lần gọi.
- Giảm `AI_SERVICE_TIMEOUT_SECONDS` từ 30s xuống ~5s (sau G1/G3) để lỗi xảy ra nhanh thay vì giữ kết nối lâu.
- *(Tùy chọn, giai đoạn sau)*: chuyển hẳn sang `httpx.AsyncClient` + SQLAlchemy async nếu load test cho thấy threadpool là nút thắt.

### G3. Scale AI Service đúng cách *(giải quyết P1)*
- Chạy nhiều worker: `uvicorn ... --workers ${AI_WORKERS}` (hoặc nhiều replica container sau một load balancer).
- Giới hạn luồng mỗi worker: `OMP_NUM_THREADS` và `SessionOptions.intra_op_num_threads = số_core / số_worker`.
- Lập bảng định cỡ (sizing) trước khi chọn số worker: RAM ≈ số_worker × (0,5–1GB) + liveness model.
- Gợi ý xuất phát cho máy 8 core / 16GB: 4 worker × 2 luồng.

### G4. Tối ưu so khớp vector *(giải quyết P6)*
1. **Lọc theo lớp trước khi so khớp**:
   ```sql
   SELECT fe.embedding_data, fp.student_id
   FROM face_embeddings fe
   JOIN face_profiles fp ON fe.face_profile_id = fp.id
   JOIN enrollments e   ON fp.student_id = e.student_id
   WHERE e.section_id = :section_id AND fp.status = 'ACTIVE';
   ```
   Không gian tìm kiếm giảm từ ~10.000 xuống ~200–300 vector (40–60 sinh viên × 5 mẫu); giảm luôn rủi ro nhận nhầm sinh viên lớp khác.
2. **Tính bằng NumPy**: chuẩn hóa L2 ma trận lớp `(N, 512)` rồi `scores = M @ q`, lấy `argmax`.
3. **Cache theo phiên**: khi phiên điểm danh chuyển sang `OPEN`, nạp ma trận embedding của lớp vào bộ nhớ (hoặc Redis); xóa cache khi hồ sơ khuôn mặt của sinh viên trong lớp thay đổi hoặc phiên đóng.
4. Về lâu dài (khi cần nhận diện ngoài phạm vi lớp): cân nhắc vector DB (Qdrant) hoặc FAISS.

### G5. Đưa kiểm tra tư thế khuôn mặt về trình duyệt *(giải quyết P3)*
- Dùng `@mediapipe/tasks-vision` (FaceLandmarker, chạy WebAssembly) để tính yaw/pitch/roll, độ sáng, độ nét ngay trên máy sinh viên.
- Bỏ vòng polling `detect-frame` mỗi 850ms; trình duyệt **chỉ gửi ảnh khi đã đạt chuẩn** cho từng tư thế.
- Giữ `detect-frame` làm fallback cho trình duyệt không hỗ trợ WASM, nhưng giới hạn tối đa ~1 req/2s và có rate limit phía server.
- Nén ảnh trước khi gửi: resize về ~640px, JPEG chất lượng 0,8 (~50–80KB thay vì 150–400KB).
- Hiệu quả dự kiến: giảm >90% lưu lượng mạng của kịch bản B.

### G6. Scale backend và cấu hình DB *(giải quyết P5, P7)*
- `uvicorn ... --workers ${BACKEND_WORKERS}` (ví dụ 4).
- Pool **theo từng worker**: `DB_POOL_SIZE=15`, `DB_MAX_OVERFLOW=15`, `DB_POOL_TIMEOUT=10` → tối đa 4 × 30 = 120 kết nối.
- MySQL: `--max_connections=200 --innodb_buffer_pool_size=1G` (đảm bảo `max_connections` > tổng pool của mọi worker + công cụ quản trị).
- Đảm bảo Redis Pub/Sub cho WebSocket hoạt động đúng khi có nhiều worker (mỗi worker subscribe kênh của phiên mà client của nó đang kết nối).

### G7. Kiến trúc hàng đợi bất đồng bộ *(chỉ làm nếu load test sau G1–G6 vẫn không đạt SLA)*
$$\text{Client} \xrightarrow{\text{POST}} \text{Backend} \xrightarrow{\text{XADD}} \text{Redis Stream} \xrightarrow{\text{consume}} \text{AI Worker Pool} \xrightarrow{\text{Pub/Sub}} \text{WebSocket}$$
- Backend trả `202 Accepted` + `task_id`; kết quả trả về qua WebSocket.
- Đánh đổi: luồng UX thay đổi (không còn kết quả đồng bộ), cần xử lý task treo/timeout, retry, và idempotency (một sinh viên không được ghi 2 bản ghi — hiện đã có ràng buộc unique + bắt `IntegrityError`).
- Với tải kịch bản A (~6 req/s), G1–G6 nhiều khả năng đã đủ; G7 là phương án dự phòng.

## 3.2. Bảo mật

### B1. Bật liveness thật và chặn fallback *(giải quyết S1)*
- Đặt model ONNX chống giả mạo (MiniFASNetV2 / Silent-Face-Anti-Spoofing) vào `ai_service/models/`, cấu hình trong `.env`:
  ```env
  LIVENESS_MODEL_PATH=/models/liveness_model.onnx
  LIVENESS_THRESHOLD=0.88
  ```
- Hiệu chỉnh ngưỡng bằng bộ dữ liệu thật của trường (ảnh thật / ảnh in / màn hình điện thoại), ghi lại tỷ lệ FAR/FRR.
- Bỏ dòng hardcode `DEBUG: "true"` của `ai_service` trong `docker-compose.yml`; tách `docker-compose.prod.yml` với `ENVIRONMENT=production`, `DEBUG=false`.
- Khi khởi động ở production mà thiếu model → healthcheck báo lỗi, service không nhận request (fail closed).

### B2. Khóa Redis/MySQL vào mạng nội bộ *(giải quyết S2, O6)*
- Bỏ khối `ports` của `redis` và `mysql` trong compose production (chỉ giữ ở file override cho dev, bind `127.0.0.1`).
- Redis: `command: redis-server --requirepass ${REDIS_PASSWORD}`, cập nhật `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0`.
- MySQL: tạo user ứng dụng riêng (`MYSQL_USER`/`MYSQL_PASSWORD`) chỉ có quyền trên DB dự án; backend không dùng `root`. Healthcheck dùng file option thay vì truyền mật khẩu trên dòng lệnh.

### B3. Thu hồi access token qua Redis *(giải quyết S3)*
- Mỗi access token có `jti` (UUID).
- Logout: `SETEX blacklist:{jti} {exp - now} 1`.
- `dependencies.get_current_user`: nếu `EXISTS blacklist:{jti}` → `401`.
- Khóa tự hết hạn cùng token nên Redis không bị phình.
- Bổ sung "đăng xuất mọi thiết bị": lưu `token_version` theo user; token có version cũ bị từ chối.

### B4. WebSocket dùng one-time ticket *(giải quyết S4)*
1. `POST /api/v1/auth/ws-ticket` (xác thực bằng header/cookie như bình thường).
2. Backend sinh `ticket = secrets.token_urlsafe(32)`, lưu `SETEX ws_ticket:{ticket} 30 {user_id}`.
3. Frontend kết nối `wss://.../ws/sessions/{id}?ticket=...`.
4. Handler dùng `GETDEL ws_ticket:{ticket}` (dùng 1 lần), sau đó vẫn kiểm tra quyền truy cập phiên như hiện tại.
- Cấu hình Nginx không ghi query string của đường dẫn `/api/v1/ws/` vào access log.

### B5. Ký HMAC cho CSRF token *(giải quyết S5)*
- Token = `random` + `.` + `HMAC_SHA256(random + session_id, CSRF_SECRET_KEY)`.
- Verify bằng `hmac.compare_digest`; gắn token với phiên đăng nhập để không dùng lại được giữa các user.

### B6. Giới hạn kích thước & tần suất ảnh *(giải quyết S6, O1)*
- Schema: `image_base64: str = Field(min_length=100, max_length=2_000_000)` (~1,5MB ảnh); kiểm tra lại kích thước ảnh sau decode ở AI Service.
- Nginx: `client_max_body_size 8m;` cho `/api/` (đủ cho enroll 5 ảnh đã nén).
- Rate limit (slowapi, đã có trong dự án):
  - `detect-frame`: 60/phút/user.
  - `recognize`: 90/phút/phiên (đủ cho 1 frame/1,6s, chặn client lỗi bắn liên tục).
  - `enroll`: 10/giờ/user.

### B7. Triển khai HTTPS *(giải quyết S7 — điều kiện bắt buộc để dùng camera)*
- Đặt reverse proxy có TLS (Caddy tự cấp chứng chỉ Let's Encrypt, hoặc Nginx + chứng chỉ nội bộ của trường nếu chỉ chạy LAN).
- Bật `COOKIE_SECURE=true`, header `Strict-Transport-Security`, WebSocket dùng `wss://`.
- Bổ sung header bảo mật: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy: camera=(self)`.

## 3.3. Vận hành & giám sát

### V1. Cấu hình Nginx *(giải quyết O1, O2)*
```nginx
location /api/ {
    client_max_body_size 8m;
    proxy_read_timeout 3600s;   # giữ WebSocket; client gửi ping định kỳ
    proxy_send_timeout 3600s;
    # ... các header hiện có
}
gzip on;
gzip_types application/json application/javascript text/css;
```

### V2. Ghim phiên bản image *(giải quyết O3)*
- Thay `chrislusf/seaweedfs:latest` bằng một tag cụ thể đã kiểm thử; tương tự cho mọi image (`mysql:8.0.x`, `redis:7.x-alpine`).

### V3. Metrics & log *(giải quyết O4)*
- Backend và AI Service xuất `/metrics` (Prometheus, ví dụ `prometheus-fastapi-instrumentator`): latency p50/p95/p99 theo endpoint, tỷ lệ lỗi, thời gian suy luận, số request đang chờ.
- Log dạng JSON có `request_id` truyền từ Nginx → Backend → AI Service để truy vết một lượt điểm danh.
- Dashboard Grafana đơn giản + cảnh báo khi p95 > 1,5s hoặc tỷ lệ lỗi > 0,1%.

### V4. Backup & khôi phục *(giải quyết O5)*
- Chạy `backup-mysql.sh` theo lịch (cron/container riêng) hằng đêm, lưu 7 bản ngày + 4 bản tuần, lưu ngoài máy chủ chính.
- Backup bucket `face-attendance` của SeaweedFS (đồng bộ sang storage thứ hai).
- Diễn tập khôi phục ít nhất 1 lần trước khi nghiệm thu.

## 3.4. Tuân thủ dữ liệu sinh trắc học *(giải quyết mục 2.5)*
- **Consent**: thêm bước đồng ý trước màn hình đăng ký khuôn mặt; lưu bảng `biometric_consents` (student_id, phiên bản điều khoản, thời điểm, IP). Không đồng ý → không cho enroll, sinh viên dùng phương thức điểm danh thay thế (thủ công/QR).
- **Quyền xóa**: endpoint cho sinh viên/admin xóa hồ sơ khuôn mặt (xóa embedding, đặt profile `DELETED`, ghi audit log).
- **Thời hạn lưu**: tự động xóa ảnh minh chứng sau X ngày (ví dụ hết học kỳ + thời gian khiếu nại), dùng lifecycle rule của object storage hoặc job định kỳ.
- **Mã hóa**: mã hóa `embedding_data` khi lưu (AES-GCM, khóa ngoài DB); ảnh minh chứng chỉ truy cập qua presigned URL thời hạn ngắn (đã có `get_evidence_url`).
- **Audit log**: ghi lại mỗi lần xem ảnh minh chứng, sửa/duyệt kết quả điểm danh, xóa hồ sơ.

## 3.5. UI/UX

### X1. React Router v6 *(giải quyết U1)*
- Các route: `/login`, `/dashboard`, `/classes`, `/sessions/:sessionId/live`, `/face-registration`, `/admin/users`.
- Guard: `ProtectedRoute`, `RoleBasedRoute`. F5 giữ nguyên trang, Back/Forward hoạt động, gửi được link phiên điểm danh.
- Nginx đã có `try_files ... /index.html` nên không cần sửa thêm phía server.

### X2. Khung nhận diện động trên video *(giải quyết U2)*
- `<canvas>` trong suốt đè lên `<video>`; dùng `bbox` trả về từ `/analyze` (G1) hoặc từ MediaPipe (G5).
- Xanh (emerald): khớp — hiển thị `MSSV – Họ tên (98%)`.
- Vàng (amber): đang phân tích / cần nhìn thẳng.
- Đỏ (rose): nghi giả mạo, thiếu sáng, hoặc không có trong danh sách lớp.
- Âm thanh xác nhận khi điểm danh thành công.

### X3. Phân trang phía server *(giải quyết U3)*
- API trả `{ items, total, page, page_size }`; frontend có thanh phân trang + ô tìm kiếm (tìm phía server) cho danh sách người dùng, sinh viên, lịch sử điểm danh.

### X4. WebSocket tự kết nối lại *(giải quyết U4)*
- Khi `onclose` bất thường: thử lại sau $\min(2^n \times 1000\text{ms}, 15\text{s})$ + jitter ngẫu nhiên; xin ticket mới (B4) trước mỗi lần kết nối lại.
- Sau khi kết nối lại: gọi API lấy lại danh sách điểm danh hiện tại để không bỏ sót sự kiện trong lúc mất kết nối.
- Banner trạng thái: 🟢 Đã kết nối · 🟡 Đang kết nối lại (lần n)… · 🔴 Mất kết nối — bấm để thử lại.

---

# PHẦN 4: LỘ TRÌNH TRIỂN KHAI

```
[GIAI ĐOẠN 0: ĐO NỀN] (2–3 ngày)
 ├── Thêm metrics/log cơ bản (V3)
 ├── Viết kịch bản load test Locust/k6 cho kịch bản A và B
 └── Chạy đo baseline → ghi lại p95, tỷ lệ lỗi, CPU/RAM hiện tại

[GIAI ĐOẠN 1: BẢO MẬT NỀN TẢNG & ĐIỀU KIỆN TRIỂN KHAI] (Tuần 1)
 ├── HTTPS + header bảo mật (B7)
 ├── Khóa Redis/MySQL vào mạng nội bộ, Redis có mật khẩu, user DB riêng (B2)
 ├── Model liveness ONNX thật, bỏ DEBUG hardcode, tách compose prod (B1)
 ├── Giới hạn kích thước ảnh + rate limit + cấu hình Nginx (B6, V1)
 └── Ghim phiên bản image (V2)

[GIAI ĐOẠN 2: TỐI ƯU HIỆU NĂNG CHI PHÍ THẤP] (Tuần 2)
 ├── Gộp 2 lượt gọi AI thành /analyze (G1)
 ├── Đổi async def → def, dùng chung httpx.Client, giảm timeout (G2)
 ├── Lọc embedding theo lớp + NumPy + cache theo phiên (G4)
 ├── Multi-worker AI có giới hạn luồng ONNX; multi-worker backend + pool theo worker (G3, G6)
 └── Chạy lại load test → so sánh với baseline

[GIAI ĐOẠN 3: BẢO MẬT PHIÊN, CLIENT-SIDE & UX] (Tuần 3)
 ├── Token blacklist (B3), WebSocket ticket (B4), CSRF HMAC (B5)
 ├── MediaPipe kiểm tra tư thế + nén ảnh phía trình duyệt (G5)
 ├── React Router (X1), khung nhận diện động (X2)
 └── Phân trang server-side (X3), WebSocket auto-reconnect (X4)

[GIAI ĐOẠN 4: TUÂN THỦ, NGHIỆM THU & DỰ PHÒNG] (Tuần 4)
 ├── Consent, quyền xóa, thời hạn lưu, mã hóa embedding, audit log (3.4)
 ├── Backup tự động + diễn tập khôi phục (V4)
 ├── Load test nghiệm thu: kịch bản A & B, chạy liên tục ≥ 10 phút, đối chiếu SLA mục 1.3
 ├── Chỉ khi chưa đạt SLA: triển khai hàng đợi bất đồng bộ (G7)
 └── Hoàn thiện tài liệu kỹ thuật & báo cáo nghiệm thu
```

## Tiêu chí hoàn thành từng giai đoạn
| Giai đoạn | Điều kiện "xong" |
|---|---|
| 0 | Có số liệu baseline p95/tỷ lệ lỗi cho kịch bản A và B |
| 1 | Camera hoạt động qua HTTPS trên máy khác trong LAN; Redis/MySQL không truy cập được từ ngoài Docker; ảnh in/màn hình bị từ chối khi điểm danh |
| 2 | Kịch bản A: p95 ≤ 1,5s, lỗi < 0,1% với 10 phiên song song |
| 3 | Logout làm token mất hiệu lực ngay; JWT không xuất hiện trong access log; kịch bản B đạt SLA |
| 4 | Load test nghiệm thu đạt SLA; có consent/xóa dữ liệu; đã khôi phục thành công từ backup |

---

# PHẦN 5: NHẬT KÝ TIẾN ĐỘ

## Đợt 1 — 29/10/2026 (Giai đoạn 1–2, phần backend/AI/hạ tầng)

| Hạng mục | Trạng thái | Ghi chú kiểm chứng |
|---|---|---|
| G1 — `/analyze` gộp embedding + liveness | ✅ Xong | Recognize và enroll chỉ gọi AI 1 lần/ảnh |
| G1+ — Chỉ nạp model `detection` + `recognition` | ✅ Xong *(phát sinh)* | Trước đó InsightFace chạy thêm 3 model không dùng (landmark 3D/106, giới tính/tuổi) |
| G2 — Gỡ chặn event loop | ✅ Xong | Phần đồng bộ của `recognize` chạy trong threadpool; `httpx.Client` dùng chung; timeout AI 30s → 10s |
| G3 — Multi-worker AI + giới hạn luồng ONNX | ✅ Xong | Mặc định 3 worker × 2 luồng (~3GB RAM) |
| G4 — So khớp theo lớp + NumPy + cache | ✅ Xong | `services/face_matcher.py`; cache tự hết hạn theo chữ ký hồ sơ của lớp |
| G6 — Multi-worker backend + pool theo worker | ✅ Xong | 4 worker × (15+15) = 120 kết nối < `max_connections=200` |
| B1 — Bỏ hardcode `DEBUG`, AI fail-closed | ✅ Một phần | `/health` trả 503 khi thiếu model ngoài dev. **Còn thiếu: file model ONNX chống giả mạo** |
| B2 — Redis mật khẩu, đóng cổng nội bộ | ✅ Xong | Cổng dev chỉ bind `127.0.0.1` qua `docker-compose.override.yml`. Chưa tách user MySQL riêng |
| B6 — Giới hạn payload + rate limit ảnh | ✅ Xong | 90/phút cho recognize (theo phiên) và detect-frame (theo user); 10/giờ cho enroll |
| B6+ — Rate limit theo IP thật | ✅ Xong *(phát sinh)* | Trước đó mọi request qua Nginx chung 1 IP → 200 lượt đăng nhập đầu giờ sẽ dính 429 |
| V1 — Nginx body/WS timeout/gzip/header bảo mật/log không lộ token | ✅ Xong | |
| V2 — Ghim phiên bản image | ✅ Xong | mysql 8.0.46, redis 7.4.11-alpine, seaweedfs 4.48 |
| Sửa lỗi upload minh chứng trước khi kiểm tra khung giờ | ✅ Xong *(phát sinh)* | Trước đây để lại file rác khi phiên đã hết giờ |

**Số liệu đo trên máy dev (Docker: 8 CPU, 7,6GB RAM):**
- Một lượt phân tích ảnh: ~520–680ms (luồng cũ gọi 2 lần: ~1.070–1.360ms).
- Thông lượng AI bão hòa ở **~4,3 frame/s** → đủ ~7 lớp điểm danh đồng thời; kịch bản A (10 lớp ≈ 6,3 frame/s) **chưa đạt trên máy này**.
- So khớp vector theo lớp: 31ms lần đầu, ~2ms khi có cache.
- E2E recognize qua backend (khớp + ghi bản ghi + upload + WebSocket): 0,78s.

**Việc tiếp theo để đạt kịch bản A:** (1) kiosk chỉ gửi frame khi trình duyệt đã thấy khuôn mặt ổn định (gộp vào G5); (2) chạy trên máy chủ nhiều core hơn; (3) cân nhắc model nhận diện nhẹ hơn (ví dụ `buffalo_s`) — **phải đăng ký lại toàn bộ khuôn mặt** vì embedding khác nhau.

---
*Kế hoạch lập cho dự án Face Attendance AI System — dựa trên rà soát mã nguồn nhánh `backend`.*

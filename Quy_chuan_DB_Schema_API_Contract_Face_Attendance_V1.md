# Quy chuẩn DB Schema và API Contract V1

**Hệ thống điểm danh bằng nhận diện khuôn mặt**

| **Hạng mục**        | **Giá trị**                                    |
|---------------------|------------------------------------------------|
| Database            | MySQL 8.0 trở lên                              |
| API Prefix          | /api/v1                                        |
| Authentication      | JWT access token và refresh token rotation     |
| Định danh           | BIGINT UNSIGNED trong DB, số nguyên trong JSON |
| Thời gian           | ISO 8601 UTC trong API, DATETIME(3) trong DB   |
| Phạm vi V1          | 14 bảng cốt lõi, 22 endpoint nghiệp vụ         |
| Tài liệu tham chiếu | FaceAI Schema V2                               |

Tài liệu này chốt cấu trúc dữ liệu, quan hệ khóa ngoại, vòng đời nghiệp vụ, quy tắc request response và mã lỗi dùng chung giữa Frontend, Backend và dịch vụ nhận diện khuôn mặt. Kết luận thiết kế chính là giữ users làm tài khoản chung, đồng thời tách students và lecturers thành hai hồ sơ chuyên biệt theo quan hệ một một.

# Mục lục

| **Phần** | **Nội dung**                            |
|----------|-----------------------------------------|
| 1        | Nguyên tắc thiết kế và quy ước chung    |
| 2        | DB Schema V1                            |
| 3        | Foreign Key Contract                    |
| 4        | Data Contract V1                        |
| 5        | Enum Contract V1                        |
| 6        | Lifecycle Contract                      |
| 7        | API Contract V1                         |
| 8        | Request Response Contract               |
| 9        | Error Contract V1                       |
| 10       | HTTP Status Contract và Response Matrix |
| 11       | Security Privacy và Freeze V1           |

# 1 Nguyên tắc thiết kế và quy ước chung

- users chỉ chứa thông tin xác thực, trạng thái và vai trò; dữ liệu riêng của sinh viên và giảng viên nằm ở bảng con.

- students.user_id và lecturers.user_id vừa là khóa chính vừa là khóa ngoại tới users.id, bảo đảm quan hệ một một.

- Tên bảng và cột dùng snake_case; enum và error code dùng UPPER_SNAKE_CASE; endpoint dùng danh từ số nhiều.

- Mọi thời điểm trong API dùng ISO 8601 UTC, ví dụ 2026-09-17T08:30:00Z. Backend chịu trách nhiệm chuyển múi giờ khi hiển thị.

- Ảnh và tệp bằng chứng lưu ở object storage riêng tư; DB chỉ lưu URI, checksum và metadata. Không trả embedding cho Frontend.

- Xóa dữ liệu học vụ dùng RESTRICT hoặc chuyển trạng thái; chỉ dữ liệu phụ thuộc hoàn toàn mới dùng CASCADE.

- Các thao tác mở phiên, điểm danh, duyệt thủ công và phúc khảo phải ghi audit log.

# 2 DB Schema V1

| **STT** | **Bảng**            | **Trường dữ liệu chính**                                                                          | **Mức độ**  | **Chức năng**                         |
|---------|---------------------|---------------------------------------------------------------------------------------------------|-------------|---------------------------------------|
| 1       | users               | id, username, email, password_hash, full_name, role, status, last_login_at, timestamps            | P0 Core     | Tài khoản, xác thực, phân quyền       |
| 2       | students            | user_id, student_code, date_of_birth, cohort, major, administrative_class, timestamps             | P0 Core     | Hồ sơ sinh viên một một với users     |
| 3       | lecturers           | user_id, lecturer_code, department, academic_title, timestamps                                    | P0 Core     | Hồ sơ giảng viên một một với users    |
| 4       | semesters           | id, code, name, start_date, end_date, status, created_at                                          | P0 Core     | Học kỳ và thời gian áp dụng           |
| 5       | courses             | id, course_code, course_name, credits, is_active, timestamps                                      | P0 Core     | Danh mục học phần                     |
| 6       | class_sections      | id, section_code, course_id, semester_id, lecturer_id, room, status, timestamps                   | P0 Core     | Lớp học phần được mở theo học kỳ      |
| 7       | enrollments         | id, section_id, student_id, status, enrolled_at, updated_at                                       | P0 Core     | Sinh viên đăng ký lớp học phần        |
| 8       | face_profiles       | id, student_id, model_name, model_version, dimension, status, consent_at, enrolled_by, timestamps | P0 AI       | Hồ sơ đăng ký khuôn mặt và đồng thuận |
| 9       | face_embeddings     | id, face_profile_id, embedding_data, quality_score, image_uri, checksum, is_primary, created_at   | P0 AI       | Một hoặc nhiều mẫu vector khuôn mặt   |
| 10      | attendance_sessions | id, section_id, session_no, schedule, late_after_at, status, created_by, timestamps               | P0 Core     | Buổi điểm danh của lớp học phần       |
| 11      | attendance_records  | id, session_id, student_id, status, method, scores, evidence, review fields, timestamps           | P0 Core     | Kết quả điểm danh chính thức          |
| 12      | attendance_appeals  | id, attendance_record_id, student_id, reason, evidence, status, resolution fields                 | P0 Core     | Phúc khảo hoặc bổ sung điểm danh      |
| 13      | refresh_tokens      | id, user_id, token_hash, expires_at, revoked_at, replaced_by_token_id, created_at                 | P0 Security | Rotation và thu hồi phiên đăng nhập   |
| 14      | audit_logs          | id, actor_user_id, action, entity_type, entity_id, request metadata, details, created_at          | P0 Security | Nhật ký hành động nhạy cảm            |

## 2 1 Quyết định tách users students lecturers

| **Bảng**  | **Chỉ chứa**                                 | **Không chứa**              |
|-----------|----------------------------------------------|-----------------------------|
| users     | Đăng nhập, tên hiển thị, email, role, status | Mã sinh viên, khoa, học hàm |
| students  | Mã sinh viên, khóa, ngành, lớp hành chính    | Mật khẩu, refresh token     |
| lecturers | Mã giảng viên, đơn vị, học hàm               | Mật khẩu, dữ liệu sinh viên |

Admin không cần bảng con trong V1 vì chưa có thuộc tính nghiệp vụ riêng. Nếu sau này Admin có hồ sơ chuyên biệt, bổ sung administrators theo cùng mẫu khóa chính kiêm khóa ngoại.

## 2 2 Ràng buộc nghiệp vụ ngoài khả năng khóa ngoại

- Chỉ users.role STUDENT được tạo students và chỉ LECTURER được tạo lecturers.

- Giảng viên chỉ được quản lý lớp học phần mà mình phụ trách.

- Sinh viên được ghi nhận điểm danh phải có enrollment ENROLLED tại lớp học phần của session.

- Mỗi sinh viên chỉ có tối đa một face profile ACTIVE tại một thời điểm.

- Khi mở session, Backend tạo sẵn bản ghi ABSENT cho toàn bộ sinh viên đang ENROLLED; check in sẽ cập nhật bản ghi đó.

# 3 Foreign Key Contract

| **Foreign Key**                         | **References**         | **On delete** | **Ý nghĩa**                      |
|-----------------------------------------|------------------------|---------------|----------------------------------|
| students.user_id                        | users.id               | CASCADE       | Hồ sơ sinh viên thuộc tài khoản  |
| lecturers.user_id                       | users.id               | CASCADE       | Hồ sơ giảng viên thuộc tài khoản |
| class_sections.course_id                | courses.id             | RESTRICT      | Lớp học phần thuộc học phần      |
| class_sections.semester_id              | semesters.id           | RESTRICT      | Lớp học phần thuộc học kỳ        |
| class_sections.lecturer_id              | lecturers.user_id      | RESTRICT      | Giảng viên phụ trách             |
| enrollments.section_id                  | class_sections.id      | CASCADE       | Ghi danh thuộc lớp học phần      |
| enrollments.student_id                  | students.user_id       | RESTRICT      | Sinh viên được ghi danh          |
| face_profiles.student_id                | students.user_id       | CASCADE       | Hồ sơ khuôn mặt của sinh viên    |
| face_embeddings.face_profile_id         | face_profiles.id       | CASCADE       | Vector thuộc hồ sơ khuôn mặt     |
| attendance_sessions.section_id          | class_sections.id      | CASCADE       | Buổi học thuộc lớp học phần      |
| attendance_sessions.created_by          | lecturers.user_id      | RESTRICT      | Giảng viên tạo buổi              |
| attendance_records.session_id           | attendance_sessions.id | CASCADE       | Kết quả thuộc buổi               |
| attendance_records.student_id           | students.user_id       | RESTRICT      | Kết quả của sinh viên            |
| attendance_appeals.attendance_record_id | attendance_records.id  | CASCADE       | Phúc khảo cho kết quả            |
| refresh_tokens.user_id                  | users.id               | CASCADE       | Token thuộc tài khoản            |
| audit_logs.actor_user_id                | users.id               | SET NULL      | Giữ log khi tài khoản không còn  |

# 4 Data Contract V1

Hợp đồng nhận diện do dịch vụ AI trả về Backend. Backend xác thực session, enrollment, ngưỡng chất lượng và tính duy nhất trước khi ghi attendance_records. Frontend không gửi student_id tự nhận dạng để tránh giả mạo.

## 4 1 Recognition Result Contract

{  
"schema_version": "1.0",  
"request_id": "rec_01J...",  
"session_id": 105,  
"captured_at": "2026-09-17T08:35:12.245Z",  
"match": {  
"student_id": 22015,  
"face_profile_id": 817,  
"confidence_score": 0.9325,  
"liveness_score": 0.9810,  
"quality_score": 0.9044  
},  
"evidence_image_uri": "private://attendance/105/rec_01J.jpg",  
"model": {"name": "InsightFace", "version": "1.0", "dimension": 512}  
}

## 4 2 Attendance Record Response

{  
"id": 9801,  
"session_id": 105,  
"student_id": 22015,  
"student_code": "B25DCCN001",  
"status": "PRESENT",  
"verification_method": "FACE",  
"check_in_at": "2026-09-17T08:35:12.245Z",  
"confidence_score": 0.9325,  
"liveness_score": 0.9810,  
"review_status": "AUTO_APPROVED"  
}

## 4 3 Quy tắc dữ liệu AI

- Các score nằm trong khoảng từ 0 đến 1 và dùng DECIMAL trong DB để so sánh ổn định.

- Ngưỡng confidence, liveness và quality là cấu hình Backend, không hard code trong hợp đồng V1.

- Không có match hoặc score dưới ngưỡng thì không đổi attendance record; trả lỗi nghiệp vụ phù hợp.

- Embedding chỉ trao đổi nội bộ giữa Backend và dịch vụ AI, không xuất hiện trong API cho Frontend.

# 5 Enum Contract V1

| **Enum**            | **Giá trị V1**                             | **Ý nghĩa**                |
|---------------------|--------------------------------------------|----------------------------|
| ROLE                | STUDENT, LECTURER, ADMIN                   | Vai trò tài khoản          |
| USER_STATUS         | ACTIVE, INACTIVE, LOCKED                   | Trạng thái tài khoản       |
| SEMESTER_STATUS     | PLANNED, ACTIVE, CLOSED                    | Vòng đời học kỳ            |
| SECTION_STATUS      | PLANNED, OPEN, CLOSED, CANCELLED           | Vòng đời lớp học phần      |
| ENROLLMENT_STATUS   | ENROLLED, DROPPED, COMPLETED               | Trạng thái ghi danh        |
| FACE_PROFILE_STATUS | PENDING, ACTIVE, REVOKED                   | Trạng thái hồ sơ khuôn mặt |
| SESSION_STATUS      | SCHEDULED, OPEN, CLOSED, CANCELLED         | Vòng đời buổi điểm danh    |
| ATTENDANCE_STATUS   | PRESENT, LATE, ABSENT, EXCUSED             | Kết quả chuyên cần         |
| VERIFICATION_METHOD | FACE, MANUAL, IMPORT                       | Nguồn xác minh             |
| REVIEW_STATUS       | AUTO_APPROVED, PENDING, APPROVED, REJECTED | Trạng thái duyệt kết quả   |
| APPEAL_STATUS       | PENDING, APPROVED, REJECTED, CANCELLED     | Trạng thái phúc khảo       |

# 6 Lifecycle Contract

## 6 1 Face Profile

PENDING → ACTIVE → REVOKED. Chỉ profile ACTIVE được dùng nhận diện. Khi kích hoạt profile mới, Backend phải thu hồi profile ACTIVE cũ trong cùng transaction.

## 6 2 Attendance Session

SCHEDULED → OPEN → CLOSED. SCHEDULED hoặc OPEN có thể chuyển CANCELLED. Session CLOSED hoặc CANCELLED không nhận thêm check in.

## 6 3 Attendance Review

PENDING → APPROVED hoặc REJECTED. Kết quả đủ ngưỡng có thể tạo AUTO_APPROVED. Điều chỉnh thủ công phải lưu reviewed_by, reviewed_at, note và audit log.

## 6 4 Attendance Appeal

PENDING → APPROVED hoặc REJECTED. Sinh viên có thể chuyển PENDING → CANCELLED trước khi giảng viên xử lý. APPROVED phải cập nhật attendance record trong cùng transaction.

# 7 API Contract V1

| **Nhóm**    | **Method** | **Endpoint**                                | **Mục đích**                | **Auth**             |
|-------------|------------|---------------------------------------------|-----------------------------|----------------------|
| AUTH        | POST       | /api/v1/auth/login                          | Đăng nhập                   | Public               |
| AUTH        | POST       | /api/v1/auth/refresh                        | Đổi access token            | Refresh token        |
| AUTH        | POST       | /api/v1/auth/logout                         | Thu hồi refresh token       | JWT                  |
| AUTH        | GET        | /api/v1/auth/me                             | User hiện tại               | JWT                  |
| USERS       | POST       | /api/v1/users                               | Tạo user và hồ sơ theo role | Admin                |
| USERS       | GET        | /api/v1/users/{user_id}                     | Chi tiết user               | Admin hoặc chính chủ |
| SECTIONS    | POST       | /api/v1/sections                            | Mở lớp học phần             | Admin                |
| SECTIONS    | GET        | /api/v1/sections                            | Danh sách lớp theo quyền    | JWT                  |
| ENROLLMENTS | POST       | /api/v1/sections/{section_id}/enrollments   | Ghi danh sinh viên          | Admin                |
| FACE        | POST       | /api/v1/students/{student_id}/face-profiles | Đăng ký khuôn mặt           | Admin hoặc chính chủ |
| FACE        | POST       | /api/v1/face-profiles/{profile_id}/activate | Kích hoạt profile           | Admin                |
| FACE        | DELETE     | /api/v1/face-profiles/{profile_id}          | Thu hồi profile             | Admin hoặc chính chủ |
| SESSIONS    | POST       | /api/v1/sections/{section_id}/sessions      | Tạo buổi điểm danh          | Lecturer             |
| SESSIONS    | POST       | /api/v1/sessions/{session_id}/open          | Mở điểm danh                | Lecturer             |
| SESSIONS    | POST       | /api/v1/sessions/{session_id}/close         | Đóng điểm danh              | Lecturer             |
| ATTENDANCE  | POST       | /api/v1/sessions/{session_id}/recognitions  | Gửi ảnh nhận diện           | JWT Student          |
| ATTENDANCE  | GET        | /api/v1/sessions/{session_id}/attendance    | Danh sách kết quả           | Lecturer             |
| ATTENDANCE  | PATCH      | /api/v1/attendance/{record_id}              | Điều chỉnh thủ công         | Lecturer             |
| ATTENDANCE  | GET        | /api/v1/students/me/attendance              | Lịch sử cá nhân             | Student              |
| APPEALS     | POST       | /api/v1/attendance/{record_id}/appeals      | Tạo phúc khảo               | Student              |
| APPEALS     | GET        | /api/v1/sections/{section_id}/appeals       | Danh sách phúc khảo         | Lecturer             |
| APPEALS     | PATCH      | /api/v1/appeals/{appeal_id}                 | Duyệt hoặc từ chối          | Lecturer             |

# 8 Request Response Contract

Các endpoint protected dùng Authorization Bearer JWT. Các ví dụ dưới đây chốt payload quan trọng; trường created_at và updated_at có thể xuất hiện theo resource response chuẩn.

## 8 1 Login

**POST /api/v1/auth/login**

**Request**

{  
"login": "son@example.com",  
"password": "Password123"  
}

**Response**

200 OK  
{  
"access_token": "\<JWT\>",  
"refresh_token": "\<opaque-token\>",  
"token_type": "bearer",  
"expires_in": 900  
}

**Lỗi chính:** 401 AUTH_INVALID_CREDENTIALS; 423 ACCOUNT_LOCKED; 422 REQUEST_VALIDATION_ERROR

## 8 2 Get Current User

**GET /api/v1/auth/me**

**Request**

Không có request body

**Response**

200 OK  
{  
"id": 15, "email": "son@example.com",  
"full_name": "Hoang Van Son",  
"role": "STUDENT", "status": "ACTIVE",  
"profile": {"student_code": "B25DCCN001"}  
}

**Lỗi chính:** 401 AUTH_UNAUTHORIZED; 403 AUTH_FORBIDDEN

## 8 3 Create User

**POST /api/v1/users**

**Request**

{  
"username": "b25dccn001",  
"email": "student@example.com",  
"password": "Password123",  
"full_name": "Nguyen Van A",  
"role": "STUDENT",  
"student": {"student_code": "B25DCCN001", "cohort": "K25", "major": "CNTT"}  
}

**Response**

201 Created  
{  
"id": 22015, "role": "STUDENT",  
"profile": {"student_code": "B25DCCN001"}  
}

**Lỗi chính:** 409 USERNAME_ALREADY_EXISTS hoặc EMAIL_ALREADY_EXISTS hoặc STUDENT_CODE_ALREADY_EXISTS

## 8 4 Create Section

**POST /api/v1/sections**

**Request**

{  
"section_code": "INT14148-01",  
"course_id": 25,  
"semester_id": 8,  
"lecturer_id": 301,  
"room": "A2-301"  
}

**Response**

201 Created  
{  
"id": 90, "section_code": "INT14148-01",  
"status": "PLANNED"  
}

**Lỗi chính:** 404 COURSE_NOT_FOUND hoặc SEMESTER_NOT_FOUND hoặc LECTURER_NOT_FOUND; 409 SECTION_CODE_EXISTS

## 8 5 Add Enrollment

**POST /api/v1/sections/{section_id}/enrollments**

**Request**

{  
"student_id": 22015  
}

**Response**

201 Created  
{  
"id": 701, "section_id": 90,  
"student_id": 22015, "status": "ENROLLED"  
}

**Lỗi chính:** 404 SECTION_NOT_FOUND hoặc STUDENT_NOT_FOUND; 409 ENROLLMENT_ALREADY_EXISTS

## 8 6 Create Face Profile

**POST /api/v1/students/{student_id}/face-profiles**

**Request**

{  
"consent": true,  
"samples": \[  
{"image_base64": "\<base64\>", "is_primary": true}  
\]  
}

**Response**

201 Created  
{  
"id": 817, "student_id": 22015,  
"status": "PENDING", "sample_count": 1,  
"quality_summary": {"accepted": 1, "rejected": 0}  
}

**Lỗi chính:** 400 CONSENT_REQUIRED hoặc FACE_QUALITY_TOO_LOW; 409 FACE_PROFILE_PENDING_EXISTS; 503 FACE_SERVICE_UNAVAILABLE

## 8 7 Create Attendance Session

**POST /api/v1/sections/{section_id}/sessions**

**Request**

{  
"session_no": 3,  
"title": "Buoi 3",  
"scheduled_start_at": "2026-09-17T08:30:00Z",  
"scheduled_end_at": "2026-09-17T10:30:00Z",  
"late_after_at": "2026-09-17T08:45:00Z"  
}

**Response**

201 Created  
{  
"id": 105, "section_id": 90,  
"session_no": 3, "status": "SCHEDULED"  
}

**Lỗi chính:** 403 NOT_SECTION_LECTURER; 409 SESSION_NUMBER_EXISTS; 422 REQUEST_VALIDATION_ERROR

## 8 8 Open Session

**POST /api/v1/sessions/{session_id}/open**

**Request**

Không có request body

**Response**

200 OK  
{  
"id": 105, "status": "OPEN",  
"opened_at": "2026-09-17T08:28:00Z",  
"attendance_initialized": 42  
}

**Lỗi chính:** 403 NOT_SECTION_LECTURER; 409 INVALID_STATE_TRANSITION

## 8 9 Recognize And Check In

**POST /api/v1/sessions/{session_id}/recognitions**

**Request**

{  
"image_base64": "\<base64\>",  
"captured_at": "2026-09-17T08:35:12.245Z",  
"client_request_id": "01J..."  
}

**Response**

200 OK  
{  
"attendance": {  
"id": 9801, "status": "PRESENT",  
"check_in_at": "2026-09-17T08:35:12.245Z",  
"confidence_score": 0.9325,  
"liveness_score": 0.9810,  
"review_status": "AUTO_APPROVED"  
}  
}

**Lỗi chính:** 400 FACE_NOT_MATCHED hoặc LIVENESS_FAILED; 403 STUDENT_NOT_ENROLLED; 409 SESSION_NOT_OPEN hoặc ALREADY_CHECKED_IN; 503 FACE_SERVICE_UNAVAILABLE

## 8 10 Get Session Attendance

**GET /api/v1/sessions/{session_id}/attendance?page=1&page_size=50&status=ABSENT**

**Request**

Không có request body

**Response**

200 OK  
{  
"items": \[{"id": 9801, "student_code": "B25DCCN001", "status": "ABSENT"}\],  
"page": 1, "page_size": 50, "total": 1  
}

**Lỗi chính:** 403 NOT_SECTION_LECTURER; 404 SESSION_NOT_FOUND

## 8 11 Manual Attendance Update

**PATCH /api/v1/attendance/{record_id}**

**Request**

{  
"status": "EXCUSED",  
"review_status": "APPROVED",  
"note": "Co minh chung hop le"  
}

**Response**

200 OK  
{  
"id": 9801, "status": "EXCUSED",  
"verification_method": "MANUAL",  
"review_status": "APPROVED", "reviewed_by": 301  
}

**Lỗi chính:** 403 NOT_SECTION_LECTURER; 404 ATTENDANCE_NOT_FOUND; 409 ATTENDANCE_LOCKED

## 8 12 Create Appeal

**POST /api/v1/attendance/{record_id}/appeals**

**Request**

{  
"reason": "Em co mat nhung nhan dien khong thanh cong",  
"evidence_uri": "upload://appeal-proof.pdf"  
}

**Response**

201 Created  
{  
"id": 1201, "attendance_record_id": 9801,  
"status": "PENDING"  
}

**Lỗi chính:** 403 NOT_ATTENDANCE_OWNER; 409 APPEAL_ALREADY_EXISTS hoặc APPEAL_PERIOD_CLOSED

## 8 13 Resolve Appeal

**PATCH /api/v1/appeals/{appeal_id}**

**Request**

{  
"decision": "APPROVED",  
"attendance_status": "PRESENT",  
"resolution_note": "Minh chung hop le"  
}

**Response**

200 OK  
{  
"id": 1201, "status": "APPROVED",  
"attendance": {"id": 9801, "status": "PRESENT", "verification_method": "MANUAL"}  
}

**Lỗi chính:** 403 NOT_SECTION_LECTURER; 404 APPEAL_NOT_FOUND; 409 APPEAL_ALREADY_RESOLVED

# 9 Error Contract V1

Tất cả lỗi dùng cùng một cấu trúc. HTTP status mô tả nhóm lỗi; error.code là mã ổn định để Frontend xử lý; request_id dùng truy vết log.

{  
"error": {  
"code": "SESSION_NOT_OPEN",  
"message": "Attendance session is not open.",  
"details": null,  
"request_id": "req_01J..."  
}  
}

| **Error Code**              | **HTTP** | **Ý nghĩa**                               |
|-----------------------------|----------|-------------------------------------------|
| AUTH_INVALID_CREDENTIALS    | 401      | Sai thông tin đăng nhập                   |
| AUTH_UNAUTHORIZED           | 401      | Thiếu hoặc token không hợp lệ             |
| AUTH_FORBIDDEN              | 403      | Không đủ quyền                            |
| ACCOUNT_LOCKED              | 423      | Tài khoản bị khóa                         |
| REQUEST_VALIDATION_ERROR    | 422      | Path query hoặc body sai schema           |
| INVALID_REQUEST             | 400      | Sai business rule                         |
| RESOURCE_NOT_FOUND          | 404      | Không tìm thấy resource chung             |
| STUDENT_NOT_FOUND           | 404      | Không tìm thấy sinh viên                  |
| LECTURER_NOT_FOUND          | 404      | Không tìm thấy giảng viên                 |
| SECTION_NOT_FOUND           | 404      | Không tìm thấy lớp học phần               |
| SESSION_NOT_FOUND           | 404      | Không tìm thấy session                    |
| ATTENDANCE_NOT_FOUND        | 404      | Không tìm thấy kết quả                    |
| APPEAL_NOT_FOUND            | 404      | Không tìm thấy phúc khảo                  |
| EMAIL_ALREADY_EXISTS        | 409      | Email đã tồn tại                          |
| STUDENT_CODE_ALREADY_EXISTS | 409      | Mã sinh viên đã tồn tại                   |
| ENROLLMENT_ALREADY_EXISTS   | 409      | Đã ghi danh                               |
| SESSION_NUMBER_EXISTS       | 409      | Trùng số buổi                             |
| INVALID_STATE_TRANSITION    | 409      | Không được chuyển trạng thái              |
| SESSION_NOT_OPEN            | 409      | Session chưa mở hoặc đã đóng              |
| ALREADY_CHECKED_IN          | 409      | Đã điểm danh                              |
| APPEAL_ALREADY_EXISTS       | 409      | Đã có phúc khảo                           |
| NOT_SECTION_LECTURER        | 403      | Không phải giảng viên phụ trách           |
| STUDENT_NOT_ENROLLED        | 403      | Sinh viên không thuộc lớp                 |
| CONSENT_REQUIRED            | 400      | Chưa xác nhận đồng thuận                  |
| FACE_QUALITY_TOO_LOW        | 400      | Ảnh không đạt chất lượng                  |
| FACE_NOT_MATCHED            | 400      | Không tìm thấy khuôn mặt phù hợp          |
| LIVENESS_FAILED             | 400      | Kiểm tra liveness không đạt               |
| FACE_SERVICE_UNAVAILABLE    | 503      | Dịch vụ nhận diện tạm thời không khả dụng |
| INTERNAL_ERROR              | 500      | Lỗi ngoài dự kiến                         |

# 10 HTTP Status Contract và Response Matrix

| **HTTP Status**           | **Quy ước**                                   |
|---------------------------|-----------------------------------------------|
| 200 OK                    | GET PATCH action hoặc nhận diện thành công    |
| 201 Created               | Tạo resource thành công                       |
| 204 No Content            | Logout hoặc thu hồi thành công không cần body |
| 400 Bad Request           | Cấu trúc hợp lệ nhưng sai business rule       |
| 401 Unauthorized          | Chưa xác thực hoặc token không hợp lệ         |
| 403 Forbidden             | Đã xác thực nhưng không đủ quyền              |
| 404 Not Found             | Không tìm thấy resource                       |
| 409 Conflict              | Trùng dữ liệu hoặc sai lifecycle              |
| 422 Unprocessable Entity  | Sai schema hoặc kiểu dữ liệu                  |
| 423 Locked                | Tài khoản bị khóa                             |
| 500 Internal Server Error | Lỗi nội bộ                                    |
| 503 Service Unavailable   | Dịch vụ AI hoặc dependency không khả dụng     |

| **Endpoint**                              | **Success** | **Possible Error Status**              |
|-------------------------------------------|-------------|----------------------------------------|
| POST /auth/login                          | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /auth/refresh                        | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /auth/logout                         | 204         | 400, 401, 403, 404, 409, 422, 500      |
| GET /auth/me                              | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /users                               | 201         | 400, 401, 403, 404, 409, 422, 500      |
| GET /users/{user_id}                      | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /sections                            | 201         | 400, 401, 403, 404, 409, 422, 500      |
| GET /sections                             | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /sections/{section_id}/enrollments   | 201         | 400, 401, 403, 404, 409, 422, 500      |
| POST /students/{student_id}/face-profiles | 201         | 400, 401, 403, 404, 409, 422, 500, 503 |
| POST /face-profiles/{profile_id}/activate | 201         | 400, 401, 403, 404, 409, 422, 500, 503 |
| DELETE /face-profiles/{profile_id}        | 204         | 400, 401, 403, 404, 409, 422, 500, 503 |
| POST /sections/{section_id}/sessions      | 201         | 400, 401, 403, 404, 409, 422, 500      |
| POST /sessions/{session_id}/open          | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /sessions/{session_id}/close         | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /sessions/{session_id}/recognitions  | 200         | 400, 401, 403, 404, 409, 422, 500, 503 |
| GET /sessions/{session_id}/attendance     | 200         | 400, 401, 403, 404, 409, 422, 500      |
| PATCH /attendance/{record_id}             | 200         | 400, 401, 403, 404, 409, 422, 500      |
| GET /students/me/attendance               | 200         | 400, 401, 403, 404, 409, 422, 500      |
| POST /attendance/{record_id}/appeals      | 200         | 400, 401, 403, 404, 409, 422, 500      |
| GET /sections/{section_id}/appeals        | 200         | 400, 401, 403, 404, 409, 422, 500      |
| PATCH /appeals/{appeal_id}                | 200         | 400, 401, 403, 404, 409, 422, 500      |

# 11 Security Privacy và Freeze V1

## 11 1 Security và dữ liệu sinh trắc học

- Password dùng Argon2id hoặc bcrypt; không lưu hoặc ghi log password thô.

- Refresh token chỉ lưu SHA 256 hash, có expiration, rotation và revoke.

- Object storage cho ảnh khuôn mặt là private; URL tải xuống phải ngắn hạn và kiểm tra quyền.

- Embedding và ảnh khuôn mặt được mã hóa khi truyền và khi lưu; quyền truy cập theo nguyên tắc tối thiểu.

- Cần có đồng thuận rõ ràng, mục đích sử dụng, thời hạn lưu và quy trình thu hồi dữ liệu khuôn mặt.

- Audit log là append only ở tầng ứng dụng; không cho API thông thường sửa hoặc xóa log.

- Không ghi image_base64, embedding, access token hoặc refresh token vào log.

## 11 2 Freeze V1

- Frontend, Backend và AI service dùng đúng tên field, enum, endpoint và Error Contract trong tài liệu này.

- Không đổi kiểu khóa, tên bảng, tên cột hoặc quan hệ đã chốt nếu chưa tạo migration và phiên bản contract mới.

- Không đưa student_code hoặc lecturer_code trở lại users; hai mã này thuộc bảng hồ sơ chuyên biệt.

- Không lưu embedding hoặc ảnh khuôn mặt trong response cho Frontend.

- Một session và một student chỉ có một attendance record chính thức.

- Mọi điều chỉnh thủ công và quyết định phúc khảo phải có actor, thời gian, lý do và audit log.

- Thay đổi breaking phải phát hành API V2 hoặc có kế hoạch tương thích ngược rõ ràng.

## 11 3 Checklist trước khi triển khai

| **Hạng mục**  | **Tiêu chí chấp nhận**                                     |
|---------------|------------------------------------------------------------|
| Migration     | Chạy được trên MySQL 8.0 sạch và có rollback plan          |
| Seed          | Có admin, semester, course và dữ liệu test tối thiểu       |
| RBAC          | Test quyền Student Lecturer Admin cho từng endpoint        |
| Transaction   | Open session, activate profile và resolve appeal là atomic |
| Idempotency   | Recognition có client_request_id để chống gửi lặp          |
| Privacy       | Không lộ ảnh, embedding, token trong API và log            |
| Observability | Mỗi lỗi có request_id và audit action phù hợp              |
| Contract test | Request response enum error code khớp tài liệu             |

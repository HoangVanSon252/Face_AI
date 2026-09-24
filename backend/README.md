# Face Attendance Backend

Dự án Backend cho Hệ thống điểm danh bằng nhận diện khuôn mặt (Face Attendance System).

## 1. Định hướng triển khai Backend (BE)
Hệ thống sử dụng FastAPI làm core, quản lý luồng dữ liệu, xác thực và lưu trữ.
- **Database Models (ORM)**: Định nghĩa các bảng (users, students, lecturers, face_profiles, attendance_records, v.v.) tuân thủ chuẩn V1, sử dụng SQLAlchemy và quản lý migration bằng Alembic.
- **Pydantic Schemas**: Xây dựng schema Data Contract V1 và Request/Response Contract.
- **CRUD Operations**: Xử lý logic đọc ghi vào Database theo các rule nghiệp vụ chặt chẽ.
- **API Endpoints**: Triển khai các router (Auth, Users, Sections, Enrollments, Face, Sessions, Attendance, Appeals) được bảo vệ bằng phân quyền JWT.
- **Services Layer**: Chứa business logic nâng cao như atomic transactions, khởi tạo sẵn bản ghi điểm danh vắng mặt, v.v.

---

## 2. Kế hoạch Triển khai AI Module (Face Recognition)
AI Module được tích hợp trực tiếp tại thư mục `app/ai_module/` và được gọi bởi các API endpoints để thực hiện quá trình nhận diện điểm danh.

### Danh sách công việc (Tasks):
- [ ] **1. Khởi tạo môi trường & Cài đặt thư viện AI**
  - Cài đặt `insightface`, `onnxruntime`, `opencv-python-headless`, `numpy`.
  - Tải pre-trained models.

- [ ] **2. Module Face Detection & Alignment (`detector.py`)**
  - Trích xuất bounding box và căn chỉnh khuôn mặt.
  - Trả về lỗi nếu không tìm thấy khuôn mặt hoặc ảnh quá mờ.

- [ ] **3. Module Liveness Detection (`liveness.py`)**
  - Kiểm tra chống giả mạo ảnh/video. Trả về `liveness_score`.

- [ ] **4. Module Embedding Extraction (`embedder.py`)**
  - Chạy mô hình (ví dụ: ArcFace) lấy vector đặc trưng (512 chiều).

- [ ] **5. Module Matching (`matcher.py`)**
  - Tính Cosine Similarity/L2 Distance với Database vector. Trả về `confidence_score` và matched ID.

- [ ] **6. Tổng hợp AI Pipeline (`pipeline.py`)**
  - Xây dựng luồng xử lý `process_attendance_image()` tuần tự: Decode -> Liveness -> Detect -> Embed -> Match.
  - Định dạng kết quả trả về đúng chuẩn **Data Contract V1**.

- [ ] **7. Tích hợp AI Pipeline vào API Endpoint**
  - Gọi pipeline trong router điểm danh.
  - Xử lý ngưỡng (threshold) và ánh xạ lỗi sang HTTP/JSON chuẩn.

- [ ] **8. Testing & Tối ưu hóa**
  - Viết Unit Test, thử nghiệm độ trễ API (< 3 giây). Tối ưu hóa nếu cần.

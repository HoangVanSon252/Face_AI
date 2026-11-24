# Face AI Service

Đây là dịch vụ vi mô (microservice) độc lập chịu trách nhiệm xử lý các tác vụ AI cho hệ thống điểm danh khuôn mặt.
Dịch vụ này được viết bằng **Python** kết hợp với **FastAPI** để đảm bảo tốc độ cao và dễ dàng gọi qua REST API.

## Cấu trúc thư mục

```text
ai_service/
├── app/
│   ├── api/
│   │   └── endpoints/
│   │       └── face.py             # Các API router (ví dụ: POST /api/v1/extract-embedding, POST /api/v1/liveness)
│   ├── core/
│   │   └── config.py               # Chứa các cấu hình (Load model, Thresholds, CORS, v.v.)
│   ├── engine/                     # Nơi chứa logic cốt lõi của AI (Core AI)
│   │   ├── detector.py             # Logic phát hiện khuôn mặt (Face Detection - dùng MTCNN, RetinaFace...)
│   │   ├── recognizer.py           # Logic trích xuất vector khuôn mặt (Face Recognition - dùng InsightFace, Facenet...)
│   │   └── liveness.py             # Logic chống giả mạo (Anti-spoofing / Liveness Check)
│   ├── schemas/
│   │   └── face.py                 # Các Pydantic model để validate request/response (Base64 image, Tọa độ bounding box, v.v.)
│   ├── utils/
│   │   └── image_processing.py     # Hàm phụ trợ xử lý ảnh (Crop ảnh, Normalize, Đọc Base64 sang OpenCV)
│   └── main.py                     # File gốc để khởi chạy FastAPI
├── weights/                        # Thư mục lưu trữ các file mô hình đã train sẵn (pre-trained weights: .pt, .onnx, .h5...)
├── tests/                          # Nơi viết Unit Test cho logic AI
├── requirements.txt                # Danh sách thư viện Python (fastapi, uvicorn, opencv-python, torch, insightface, v.v.)
└── Dockerfile                      # Dùng để build môi trường AI đóng gói
```

## Luồng hoạt động dự kiến
1. **Frontend / Thiết bị IoT** gửi ảnh khuôn mặt (dạng Base64 hoặc File) lên hệ thống.
2. **Backend (nghiệp vụ)** chuyển tiếp ảnh đó sang cho **AI Service** thông qua API nội bộ (Internal API).
3. **AI Service** thực hiện:
   - Chạy qua `liveness.py` để kiểm tra ảnh thật hay giả mạo.
   - Chạy qua `detector.py` để tìm khuôn mặt.
   - Chạy qua `recognizer.py` để biến khuôn mặt thành một dãy số (vector embedding).
4. **AI Service** trả vector này về cho **Backend**. Backend tiến hành so sánh vector với database (dùng PGVector hoặc thuật toán so sánh cosine) để tìm ra sinh viên.


## Chống giả mạo (MiniFASNet)

Hệ thống dùng ensemble 2 model **MiniFASNetV2 (crop 2,7×)** và **MiniFASNetV1SE (crop 4,0×)**
của [Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing)
(Apache-2.0, giấy phép đi kèm tại `models/MiniFASNet-LICENSE.txt`). File `.onnx` không commit
vào Git; mỗi máy/môi trường deploy tự build một lần từ trọng số chính thức:

```sh
sh scripts/liveness/build_models.sh   # cần Docker; kiểm SHA-256 trọng số + so khớp ONNX với PyTorch
```

Sau đó đặt các biến `LIVENESS_*` theo `.env.example`. Điểm liveness là trung bình xác suất
"mặt thật" của 2 model; khung hình bị từ chối khi điểm < `LIVENESS_THRESHOLD`.

- Ngoài môi trường `development` + `DEBUG=true`, thiếu model thì `/health` trả 503 (fail closed).
- **Hiệu chỉnh ngưỡng** bằng webcam thật tại phòng học: thử mặt thật, ảnh in, ảnh trên điện thoại
  dưới ánh sáng thực tế rồi chỉnh `LIVENESS_THRESHOLD` (mặc định 0,80).

Chạy test: `docker compose run --rm --no-deps ai_service sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q tests"`

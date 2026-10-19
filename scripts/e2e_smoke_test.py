"""End-to-End Smoke Test Script for Face AI Attendance System
Runs complete verification across all microservices and real-world edge cases:
1. OpenAPI specification contract (/openapi.json, /api/v1/openapi.json)
2. Student authentication & JWT issuance
3. Face profile enrollment with multiple real face samples (512-dim InsightFace)
4. Active face profile retrieval
5. Teacher authentication
6. Academic semester, course, section & enrollment management
7. Attendance session creation, conflict check, and opening
8. AI-powered real-time facial recognition matching
9. Object storage (SeaweedFS / S3) biometric evidence upload & presigned URL verification
10. Real-world edge cases:
    - 10.1: Duplicate recognition prevention (409 Conflict)
    - 10.2: Recognition rejection on closed sessions (409 Conflict)
    - 10.3: Unauthorized access prevention (401 Unauthorized)
"""
import base64
import json
import os
import sys
from pathlib import Path
import requests

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

def get_base_url() -> str:
    if "BASE_URL" in os.environ:
        return os.environ["BASE_URL"]
    for url in ["http://localhost:8001", "http://backend:8000", "http://localhost"]:
        try:
            r = requests.get(f"{url}/health", timeout=1)
            if r.status_code == 200:
                return url
        except Exception:
            continue
    return "http://localhost:8001"

BASE_URL = get_base_url()


def get_face_samples() -> tuple[str, str, str]:
    sample_file = Path(__file__).resolve().parent / "sample_faces.json"
    try:
        import cv2
        import insightface
        print("Extracting face samples via InsightFace buffalo_l dataset...")
        img = insightface.data.get_image("t1")
        x1, y1, x2, y2 = 466, 268, 574, 416
        crop1 = img[max(0, y1-80):min(img.shape[0], y2+80), max(0, x1-80):min(img.shape[1], x2+80)]
        crop2 = img[max(0, y1-75):min(img.shape[0], y2+75), max(0, x1-75):min(img.shape[1], x2+75)]
        crop3 = img[max(0, y1-85):min(img.shape[0], y2+85), max(0, x1-85):min(img.shape[1], x2+85)]

        def to_b64(cv_img):
            _, buf = cv2.imencode(".jpg", cv_img)
            return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

        b64_1 = to_b64(crop1)
        b64_2 = to_b64(crop2)
        b64_3 = to_b64(crop3)
        try:
            sample_file.write_text(json.dumps([b64_1, b64_2, b64_3]))
        except Exception:
            pass
        return b64_1, b64_2, b64_3
    except Exception as exc:
        if sample_file.exists():
            print(f"Loading cached face samples from {sample_file} (fallback: {exc})...")
            samples = json.loads(sample_file.read_text())
            return samples[0], samples[1], samples[2]
        raise RuntimeError(f"Could not load face samples: {exc}. Install cv2 and insightface or provide sample_faces.json.") from exc


def main():
    print(f"=== STARTING FULL END-TO-END SMOKE TEST ({BASE_URL}) ===")

    # 1. Verify OpenAPI
    print("\n--- 1. Testing OpenAPI Endpoints ---")
    r1 = requests.get(f"{BASE_URL}/openapi.json")
    print(f"GET /openapi.json: {r1.status_code}")
    assert r1.status_code == 200, f"Expected 200, got {r1.status_code}"

    r2 = requests.get(f"{BASE_URL}/api/v1/openapi.json")
    print(f"GET /api/v1/openapi.json: {r2.status_code}")
    assert r2.status_code == 200, f"Expected 200, got {r2.status_code}"

    # 2. Login as Student
    print("\n--- 2. Login as Student ---")
    login_res = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        data={"username": "student", "password": "Student@123456"}
    )
    print(f"Login Student status: {login_res.status_code}")
    assert login_res.status_code == 200, f"Student login failed: {login_res.text}"
    student_token = login_res.json()["access_token"]

    me_res = requests.get(
        f"{BASE_URL}/api/v1/auth/me",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert me_res.status_code == 200
    student_user_id = me_res.json()["id"]
    print(f"Student User ID: {student_user_id}, Name: {me_res.json().get('full_name')}")

    # 3. Generate Face Samples for Enrollment
    print("\n--- 3. Preparing Face Samples ---")
    b64_1, b64_2, b64_3 = get_face_samples()

    # 4. Enroll Face Profile
    print("\n--- 4. Enrolling Face Profile for Student ---")
    enroll_payload = {
        "consent": True,
        "samples": [
            {"image_base64": b64_1, "is_primary": True},
            {"image_base64": b64_2, "is_primary": False},
            {"image_base64": b64_3, "is_primary": False},
        ]
    }
    enroll_res = requests.post(
        f"{BASE_URL}/api/v1/students/{student_user_id}/face-profiles",
        headers={"Authorization": f"Bearer {student_token}"},
        json=enroll_payload
    )
    print(f"Enroll response ({enroll_res.status_code}): {enroll_res.text}")
    assert enroll_res.status_code == 201, f"Enroll failed: {enroll_res.text}"
    profile_data = enroll_res.json()
    assert profile_data["status"] == "ACTIVE"
    assert profile_data["sample_count"] == 3
    print(f"Enrolled Profile ID: {profile_data['id']}, status: {profile_data['status']}")

    # 5. Verify Face Profile Retrieval
    print("\n--- 5. Getting Active Face Profile ---")
    get_profile_res = requests.get(
        f"{BASE_URL}/api/v1/students/{student_user_id}/face-profile",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    print(f"Get Profile response ({get_profile_res.status_code}): {get_profile_res.text}")
    assert get_profile_res.status_code == 200

    # 6. Login as Teacher
    print("\n--- 6. Login as Teacher ---")
    teacher_login = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        data={"username": "teacher", "password": "Teacher@123456"}
    )
    print(f"Teacher login status: {teacher_login.status_code}")
    assert teacher_login.status_code == 200
    teacher_token = teacher_login.json()["access_token"]
    me_teacher = requests.get(
        f"{BASE_URL}/api/v1/auth/me",
        headers={"Authorization": f"Bearer {teacher_token}"}
    ).json()
    teacher_user_id = me_teacher["id"]
    print(f"Teacher User ID: {teacher_user_id}")

    # 7. Login as Admin to setup academic structure if needed
    print("\n--- 7. Setup Academic Section & Session ---")
    admin_login = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        data={"username": "admin", "password": "Admin@123456"}
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    # Check / create semester
    semesters = requests.get(f"{BASE_URL}/api/v1/academic/semesters", headers={"Authorization": f"Bearer {admin_token}"}).json()
    if not semesters:
        sem_res = requests.post(
            f"{BASE_URL}/api/v1/academic/semesters",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"code": "FA26", "name": "Fall 2026", "start_date": "2026-09-01", "end_date": "2026-12-31", "status": "ACTIVE"}
        )
        semester_id = sem_res.json()["id"]
    else:
        semester_id = semesters[0]["id"]
    print(f"Semester ID: {semester_id}")

    # Check / create course
    courses = requests.get(f"{BASE_URL}/api/v1/academic/courses", headers={"Authorization": f"Bearer {admin_token}"}).json()
    if not courses:
        crs_res = requests.post(
            f"{BASE_URL}/api/v1/academic/courses",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"course_code": "CS101", "course_name": "Computer Science Intro", "credits": 3}
        )
        course_id = crs_res.json()["id"]
    else:
        course_id = courses[0]["id"]
    print(f"Course ID: {course_id}")

    # Check / create section
    sections = requests.get(f"{BASE_URL}/api/v1/academic/sections", headers={"Authorization": f"Bearer {teacher_token}"}).json()
    if not sections:
        sec_res = requests.post(
            f"{BASE_URL}/api/v1/academic/sections",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"section_code": "CS101-01", "course_id": course_id, "semester_id": semester_id, "lecturer_id": teacher_user_id, "room": "A101"}
        )
        section_id = sec_res.json()["id"]
    else:
        section_id = sections[0]["id"]
    print(f"Section ID: {section_id}")

    # Enroll student in section
    enroll_student_res = requests.post(
        f"{BASE_URL}/api/v1/academic/sections/{section_id}/enrollments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"student_id": student_user_id, "section_id": section_id}
    )
    print(f"Enroll student into section: status {enroll_student_res.status_code}")

    # Create & Open Attendance Session
    print("\n--- 8. Create and Open Attendance Session ---")
    sessions_list = requests.get(
        f"{BASE_URL}/api/v1/sections/{section_id}/sessions",
        headers={"Authorization": f"Bearer {teacher_token}"}
    ).json()

    # Close any currently open session so the section can open a new one
    for s in sessions_list:
        if s.get("status") == "OPEN":
            print(f"Closing previously open session {s['id']}")
            requests.post(
                f"{BASE_URL}/api/v1/sessions/{s['id']}/close",
                headers={"Authorization": f"Bearer {teacher_token}"}
            )

    next_session_no = (max([s["session_no"] for s in sessions_list], default=0) + 1)
    print(f"Creating new Session #{next_session_no} for Section {section_id}")

    session_res = requests.post(
        f"{BASE_URL}/api/v1/sections/{section_id}/sessions",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={
            "session_no": next_session_no,
            "title": f"Buoi {next_session_no}",
            "scheduled_start_at": "2026-10-15T08:00:00",
            "scheduled_end_at": "2026-10-15T23:59:00",
            "late_after_at": "2026-10-15T23:50:00"
        }
    )
    assert session_res.status_code == 201, f"Create session failed: {session_res.text}"
    session_id = session_res.json()["id"]
    print(f"Created Session ID: {session_id}")

    open_res = requests.post(
        f"{BASE_URL}/api/v1/sessions/{session_id}/open",
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    print(f"Open session status: {open_res.status_code}")
    assert open_res.status_code == 200

    # 9. Perform Face Recognition Attendance
    print("\n--- 9. Face Recognition Attendance Test ---")
    recog_res = requests.post(
        f"{BASE_URL}/api/v1/sessions/{session_id}/recognitions",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={"image_base64": b64_1}
    )
    print(f"Recognition status ({recog_res.status_code}): {recog_res.text}")
    assert recog_res.status_code == 201, f"Recognition failed: {recog_res.text}"
    recog_data = recog_res.json()
    assert recog_data["matched"] is True
    assert recog_data["student_id"] == student_user_id
    record_id = recog_data["attendance_record_id"]
    print(f"MATCH SUCCESS! Record ID: {record_id}, Confidence: {recog_data['confidence_score']}")

    # 10. Check Evidence URL in Object Storage
    print("\n--- 10. Check Evidence URL ---")
    ev_res = requests.get(
        f"{BASE_URL}/api/v1/attendance/{record_id}/evidence-url",
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    print(f"Evidence URL status ({ev_res.status_code}): {ev_res.text}")
    assert ev_res.status_code == 200
    ev_data = ev_res.json()
    assert "url" in ev_data
    print(f"Evidence presigned URL: {ev_data['url']}")

    # 11. Real-World Edge Case Verification
    print("\n--- 11. Real-World Edge Case Verification ---")

    # 11.1 Duplicate Check-in in Same Session
    print("Test 11.1: Duplicate check-in rejection")
    dup_res = requests.post(
        f"{BASE_URL}/api/v1/sessions/{session_id}/recognitions",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={"image_base64": b64_1}
    )
    print(f"Duplicate status: {dup_res.status_code} (expected 409)")
    assert dup_res.status_code == 409, f"Expected 409 Conflict, got {dup_res.status_code}"

    # 11.2 Check-in on Closed Session
    print("Test 11.2: Check-in on closed session rejection")
    requests.post(
        f"{BASE_URL}/api/v1/sessions/{session_id}/close",
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    closed_res = requests.post(
        f"{BASE_URL}/api/v1/sessions/{session_id}/recognitions",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={"image_base64": b64_1}
    )
    print(f"Closed session status: {closed_res.status_code} (expected 409)")
    assert closed_res.status_code == 409, f"Expected 409 Conflict, got {closed_res.status_code}"

    # 11.3 Unauthorized / Expired Token Rejection
    print("Test 11.3: Invalid token rejection")
    unauth_res = requests.get(
        f"{BASE_URL}/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid_expired_jwt_token_12345"}
    )
    print(f"Invalid token status: {unauth_res.status_code} (expected 401)")
    assert unauth_res.status_code == 401, f"Expected 401, got {unauth_res.status_code}"

    print("\n=======================================================")
    print("=== ALL E2E SMOKE & EDGE TESTS PASSED (14/14)! =======")
    print("=======================================================")


if __name__ == "__main__":
    main()

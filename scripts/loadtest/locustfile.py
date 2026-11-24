"""Load test for the SLA in KE_HOACH_NANG_CAP_HE_THONG_200_USER.md (section 1.3).

Scenario A (KioskUser): one kiosk per open session posts a webcam frame to
/sessions/{id}/recognitions every 1.6s, like LiveSessionView. The frame is a
face that is NOT enrolled, so the full pipeline runs (analyse + liveness +
section matching) without creating attendance records.

Scenario B (StudentUser): students sign in at the start of class and browse
their dashboard/history (registration pose checks now run in the browser).

Environment:
    SESSION_IDS   comma-separated open session ids (scripts/loadtest/prepare_sessions.py)
    FACE_IMAGE    path to a JPEG data URL file of a non-enrolled face
    TEACHER_USER / TEACHER_PASSWORD, STUDENT_USER / STUDENT_PASSWORD

Run (see scripts/loadtest/README.md):
    locust -f locustfile.py --headless -u 210 -r 20 -t 5m --host http://frontend
"""
import itertools
import os
import threading

from locust import HttpUser, between, constant_pacing, task

SESSION_IDS = [int(value) for value in os.environ.get("SESSION_IDS", "").split(",") if value]
FACE_IMAGE = open(os.environ["FACE_IMAGE"], encoding="ascii").read().strip()
_session_cycle = itertools.cycle(SESSION_IDS or [0])
_cycle_lock = threading.Lock()
HEADERS = {"Host": "localhost"}


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
        headers=HEADERS,
        name="/auth/login",
    )
    response.raise_for_status()
    return response.json()["access_token"]


class KioskUser(HttpUser):
    """Lecturer's attendance kiosk: one per open session."""

    weight = 1
    fixed_count = len(SESSION_IDS)
    wait_time = constant_pacing(1.6)

    def on_start(self):
        with _cycle_lock:
            self.session_id = next(_session_cycle)
        token = _login(self.client, os.environ.get("TEACHER_USER", "teacher"), os.environ.get("TEACHER_PASSWORD", "Teacher@123456"))
        self.headers = {**HEADERS, "Authorization": f"Bearer {token}"}

    @task
    def recognize(self):
        with self.client.post(
            f"/api/v1/sessions/{self.session_id}/recognitions",
            json={"image_base64": FACE_IMAGE},
            headers=self.headers,
            name="/sessions/[id]/recognitions",
            catch_response=True,
        ) as response:
            # 201 with matched=false is the expected answer for a stranger.
            if response.status_code == 201:
                response.success()
            else:
                response.failure(f"HTTP {response.status_code}: {response.text[:120]}")


class StudentUser(HttpUser):
    """Student opening the app at the start of class."""

    weight = 20
    wait_time = between(5, 15)

    def on_start(self):
        token = _login(self.client, os.environ.get("STUDENT_USER", "student"), os.environ.get("STUDENT_PASSWORD", "Student@123456"))
        self.headers = {**HEADERS, "Authorization": f"Bearer {token}"}

    @task(3)
    def me(self):
        self.client.get("/api/v1/auth/me", headers=self.headers, name="/auth/me")

    @task(2)
    def history(self):
        self.client.get("/api/v1/attendance", headers=self.headers, name="/attendance")

    @task(1)
    def face_profile(self):
        with self.client.get("/api/v1/students/me/face-profile", headers=self.headers, name="/students/me/face-profile", catch_response=True) as response:
            if response.status_code in (200, 404):
                response.success()

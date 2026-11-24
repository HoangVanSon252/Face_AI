import numpy as np
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.limiter import session_key, user_key
from app.services import ai_client, face_matcher


def _matrix(rows, student_ids, signature=("sig",)):
    return face_matcher.SectionMatrix(
        signature=signature,
        matrix=face_matcher._normalise(np.asarray(rows, dtype=np.float32)),
        student_ids=np.asarray(student_ids, dtype=np.int64),
    )


def test_best_match_returns_closest_student_with_cosine_score(monkeypatch):
    monkeypatch.setattr(
        face_matcher,
        "section_matrix",
        lambda db, section_id, dimension: _matrix([[1, 0, 0], [0, 1, 0], [0.9, 0.1, 0]], [7, 8, 9]),
    )

    score, student_id = face_matcher.best_match(None, 1, [2.0, 0.0, 0.0])

    assert student_id == 7
    assert score == pytest.approx(1.0)


def test_best_match_is_none_when_section_has_no_profiles(monkeypatch):
    monkeypatch.setattr(
        face_matcher,
        "section_matrix",
        lambda db, section_id, dimension: _matrix(np.empty((0, 3)), []),
    )

    assert face_matcher.best_match(None, 1, [1.0, 0.0, 0.0]) is None


def test_section_matrix_reloads_only_when_signature_changes(monkeypatch):
    face_matcher.clear_cache()
    signature = {"value": (1, 10, "t1")}
    loads = []

    monkeypatch.setattr(face_matcher, "_signature", lambda db, section_id: signature["value"])

    def fake_load(db, section_id, sig, dimension):
        loads.append(sig)
        return _matrix([[1, 0]], [1], signature=sig)

    monkeypatch.setattr(face_matcher, "_load", fake_load)

    face_matcher.section_matrix(None, 5, 2)
    face_matcher.section_matrix(None, 5, 2)
    assert len(loads) == 1

    # A new enrollment changes count/max id, so every worker reloads.
    signature["value"] = (2, 11, "t2")
    face_matcher.section_matrix(None, 5, 2)
    assert len(loads) == 2
    face_matcher.clear_cache()


def _request(headers=None, path_params=None):
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": ("10.0.0.5", 1234),
        "path_params": path_params or {},
    }
    return Request(scope)


def test_user_key_separates_users_behind_the_same_ip():
    first = user_key(_request({"Authorization": "Bearer a"}))
    second = user_key(_request({"Authorization": "Bearer b"}))

    assert first != second
    assert "Bearer" not in first
    assert user_key(_request()) == "10.0.0.5"


def test_session_key_buckets_by_attendance_session():
    assert session_key(_request(path_params={"session_id": 42})) == "session:42"


class _Response:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


class _Client:
    def __init__(self, response):
        self.response = response
        self.paths = []

    def post(self, path, json, **kwargs):
        self.paths.append(path)
        return self.response


def test_analyze_face_uses_single_ai_round_trip(monkeypatch):
    client = _Client(_Response(200, {"embedding": [0.1], "liveness": {"is_live": True, "score": 0.9}}))
    monkeypatch.setattr(ai_client, "get_client", lambda: client)

    result = ai_client.analyze_face("x" * 200)

    assert client.paths == ["/api/v1/face/analyze"]
    assert result["liveness"]["is_live"] is True


def test_analyze_face_propagates_ai_validation_errors(monkeypatch):
    monkeypatch.setattr(ai_client, "get_client", lambda: _Client(_Response(422, {"detail": "No face detected"})))

    with pytest.raises(HTTPException) as exc:
        ai_client.analyze_face("x" * 200)

    assert exc.value.status_code == 422
    assert exc.value.detail == "No face detected"


def test_ai_calls_are_rejected_fast_when_all_slots_are_busy(monkeypatch):
    from threading import BoundedSemaphore

    monkeypatch.setattr(ai_client, "_inflight", BoundedSemaphore(1))
    monkeypatch.setattr(ai_client.settings, "AI_QUEUE_WAIT_SECONDS", 0.05)
    ai_client._inflight.acquire()  # another request holds the only slot

    with pytest.raises(HTTPException) as exc:
        ai_client.analyze_face("x" * 200)

    assert exc.value.status_code == 503
    assert exc.value.headers == {"Retry-After": "1"}
    ai_client._inflight.release()


def test_ai_slot_is_released_after_errors(monkeypatch):
    from threading import BoundedSemaphore

    monkeypatch.setattr(ai_client, "_inflight", BoundedSemaphore(1))
    monkeypatch.setattr(ai_client, "get_client", lambda: _Client(_Response(422, {"detail": "No face detected"})))

    for _ in range(3):  # would block on the 2nd call if the slot leaked
        with pytest.raises(HTTPException):
            ai_client.analyze_face("x" * 200)

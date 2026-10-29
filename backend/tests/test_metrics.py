from fastapi.testclient import TestClient

from app.main import app


def test_requests_pass_through_the_full_middleware_stack():
    """Regression: an incompatible instrumentation middleware once turned every request into a 500."""
    client = TestClient(app, base_url="http://localhost")

    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/sessions/15").status_code == 401


def test_metrics_use_route_templates_not_ids():
    client = TestClient(app, base_url="http://localhost")
    client.get("/api/v1/sessions/987654")

    body = client.get("/metrics").text

    assert 'route="/api/v1/sessions/{session_id}"' in body
    assert "987654" not in body

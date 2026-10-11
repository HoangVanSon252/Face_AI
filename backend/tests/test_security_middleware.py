from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.middleware import (
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)


def create_test_app() -> FastAPI:
    app = FastAPI()

    @app.post("/echo")
    def echo():
        return {"status": "ok"}

    app.add_middleware(RequestSizeLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    return app


def test_security_headers_are_added():
    response = TestClient(create_test_app()).post("/echo")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "content-security-policy" in response.headers


def test_request_larger_than_configured_limit_is_rejected(monkeypatch):
    monkeypatch.setattr("app.core.middleware.settings.MAX_REQUEST_BODY_SIZE", 10)

    response = TestClient(create_test_app()).post("/echo", content="a" * 11)

    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"


def test_production_rejects_an_insecure_cookie_configuration():
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="a" * 32,
            CSRF_SECRET_KEY="b" * 32,
            COOKIE_SECURE=False,
            MYSQL_USER="user",
            MYSQL_PASSWORD="password",
            MYSQL_HOST="localhost",
            MYSQL_PORT="3306",
            MYSQL_DB="database",
            REDIS_URL="redis://localhost:6379/0",
        )

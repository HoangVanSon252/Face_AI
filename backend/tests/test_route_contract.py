from app.main import app


def test_auth_and_user_routes_follow_v1_contract():
    paths = app.openapi()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/refresh" in paths
    assert "/api/v1/auth/logout" in paths
    assert "/api/v1/auth/me" in paths
    assert "/api/v1/users/" in paths
    assert "/api/v1/login/access-token" not in paths
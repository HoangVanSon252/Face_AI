from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token


def test_access_token_has_required_security_claims():
    token = create_access_token("42")
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

    assert payload["sub"] == "42"
    assert payload["type"] == "access"
    assert payload["jti"]
    assert payload["iat"]
    assert payload["exp"]

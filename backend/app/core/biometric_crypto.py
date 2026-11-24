"""At-rest encryption of face embeddings (sensitive biometric personal data).

Stored format (JSON string in face_embeddings.embedding_data):
    "v1:<base64(nonce[12] || AES-256-GCM(float32 little-endian vector))>"
The AAD binds the ciphertext to its purpose, so an encrypted value copied into
another column/table does not decrypt. Legacy rows stored as a plain JSON list
are still readable; alembic revision e1f2a3b4c5d6 encrypts them.
"""
import base64
import os
from functools import lru_cache

import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_PREFIX = "v1:"
_AAD = b"eduface:face_embedding:v1"
_NONCE_BYTES = 12


class EmbeddingKeyMissing(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _cipher() -> AESGCM:
    if not settings.FACE_EMBEDDING_KEY:
        raise EmbeddingKeyMissing("FACE_EMBEDDING_KEY is required to store face embeddings")
    key = base64.b64decode(settings.FACE_EMBEDDING_KEY, validate=True)
    if len(key) != 32:
        raise EmbeddingKeyMissing("FACE_EMBEDDING_KEY must be 32 bytes, Base64-encoded")
    return AESGCM(key)


def encrypt_embedding(embedding: list[float]) -> str:
    plaintext = np.asarray(embedding, dtype="<f4").tobytes()
    nonce = os.urandom(_NONCE_BYTES)
    ciphertext = _cipher().encrypt(nonce, plaintext, _AAD)
    return _PREFIX + base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_embedding(stored) -> list[float]:
    """Accept both encrypted strings and legacy plaintext lists."""
    if isinstance(stored, list):
        return [float(value) for value in stored]
    if not isinstance(stored, str) or not stored.startswith(_PREFIX):
        raise ValueError("Unrecognised face embedding format")
    raw = base64.b64decode(stored[len(_PREFIX):], validate=True)
    plaintext = _cipher().decrypt(raw[:_NONCE_BYTES], raw[_NONCE_BYTES:], _AAD)
    return np.frombuffer(plaintext, dtype="<f4").astype(float).tolist()


def is_encrypted(stored) -> bool:
    return isinstance(stored, str) and stored.startswith(_PREFIX)

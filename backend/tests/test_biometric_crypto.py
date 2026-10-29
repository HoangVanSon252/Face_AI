import base64
import os

import numpy as np
import pytest
from cryptography.exceptions import InvalidTag

from app.core import biometric_crypto


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setattr(biometric_crypto.settings, "FACE_EMBEDDING_KEY", base64.b64encode(os.urandom(32)).decode())
    biometric_crypto._cipher.cache_clear()
    yield
    biometric_crypto._cipher.cache_clear()


def test_embedding_round_trips_as_float32(key):
    embedding = np.random.default_rng(1).standard_normal(512).astype(np.float32).tolist()

    stored = biometric_crypto.encrypt_embedding(embedding)

    assert stored.startswith("v1:")
    assert biometric_crypto.is_encrypted(stored)
    assert biometric_crypto.decrypt_embedding(stored) == pytest.approx(embedding, abs=1e-7)


def test_same_embedding_encrypts_differently_each_time(key):
    embedding = [0.1] * 8

    assert biometric_crypto.encrypt_embedding(embedding) != biometric_crypto.encrypt_embedding(embedding)


def test_legacy_plaintext_list_is_still_readable(key):
    assert biometric_crypto.decrypt_embedding([0.5, -0.25]) == [0.5, -0.25]
    assert not biometric_crypto.is_encrypted([0.5, -0.25])


def test_tampered_ciphertext_is_rejected(key):
    stored = biometric_crypto.encrypt_embedding([0.1] * 8)
    raw = bytearray(base64.b64decode(stored[3:]))
    raw[-1] ^= 0x01

    with pytest.raises(InvalidTag):
        biometric_crypto.decrypt_embedding("v1:" + base64.b64encode(bytes(raw)).decode())


def test_wrong_key_cannot_decrypt(key, monkeypatch):
    stored = biometric_crypto.encrypt_embedding([0.1] * 8)
    monkeypatch.setattr(biometric_crypto.settings, "FACE_EMBEDDING_KEY", base64.b64encode(os.urandom(32)).decode())
    biometric_crypto._cipher.cache_clear()

    with pytest.raises(InvalidTag):
        biometric_crypto.decrypt_embedding(stored)


def test_missing_key_refuses_to_store_embeddings(monkeypatch):
    monkeypatch.setattr(biometric_crypto.settings, "FACE_EMBEDDING_KEY", None)
    biometric_crypto._cipher.cache_clear()

    with pytest.raises(biometric_crypto.EmbeddingKeyMissing):
        biometric_crypto.encrypt_embedding([0.1])
    biometric_crypto._cipher.cache_clear()

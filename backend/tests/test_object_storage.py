import base64

import pytest
from fastapi import HTTPException

from app.services.object_storage import _decode_image_data_url


def test_decode_image_data_url_accepts_jpeg_and_png():
    payload = base64.b64encode(b"image-bytes").decode()

    image, mime_type = _decode_image_data_url(f"data:image/jpeg;base64,{payload}")
    assert image == b"image-bytes"
    assert mime_type == "image/jpeg"

    image, mime_type = _decode_image_data_url(f"data:image/png;base64,{payload}")
    assert image == b"image-bytes"
    assert mime_type == "image/png"


def test_decode_image_data_url_rejects_non_raster_payloads():
    with pytest.raises(HTTPException) as exc_info:
        _decode_image_data_url("data:image/svg+xml;base64,PHN2Zy8+")

    assert exc_info.value.status_code == 422

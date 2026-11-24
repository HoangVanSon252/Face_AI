from pathlib import Path

import numpy as np
import pytest

from app.core.config import LivenessModelSpec, Settings
from app.engine import liveness


def test_liveness_models_parses_ensemble_with_crop_scales():
    settings = Settings(LIVENESS_MODELS="/models/a.onnx@2.7, /models/b.onnx@4.0")

    assert settings.liveness_models == [
        LivenessModelSpec(Path("/models/a.onnx"), 2.7),
        LivenessModelSpec(Path("/models/b.onnx"), 4.0),
    ]


def test_liveness_models_falls_back_to_legacy_single_model():
    # Explicit empty values: the container environment may define LIVENESS_MODELS.
    settings = Settings(LIVENESS_MODELS="", LIVENESS_MODEL_PATH="/models/legacy.onnx")

    assert settings.liveness_models == [LivenessModelSpec(Path("/models/legacy.onnx"), None)]
    assert Settings(LIVENESS_MODELS="", LIVENESS_MODEL_PATH="").liveness_models == []


def test_scaled_crop_enlarges_box_around_its_centre():
    image = np.zeros((1000, 1000, 3), dtype=np.uint8)

    crop = liveness._scaled_crop(image, (450, 450, 550, 550), 2.7)

    # 100px box x 2.7 = 270px patch (+1 for the inclusive upstream slice).
    assert crop.shape[:2] == (271, 271)


def test_scaled_crop_shifts_inside_frame_instead_of_clipping():
    image = np.zeros((400, 600, 3), dtype=np.uint8)

    crop = liveness._scaled_crop(image, (0, 0, 100, 100), 2.7)

    # A face in the corner keeps the full 2.7x context by shifting the window.
    assert crop.shape[:2] == (271, 271)


def test_scaled_crop_caps_scale_to_frame_size():
    image = np.zeros((300, 300, 3), dtype=np.uint8)

    crop = liveness._scaled_crop(image, (100, 100, 200, 200), 4.0)

    assert crop.shape[0] <= 300 and crop.shape[1] <= 300


@pytest.mark.parametrize(
    ("output_type", "output", "expected"),
    [
        ("logits", [0.0, 2.0, 0.0], np.exp(2.0) / (np.exp(2.0) + 2)),
        ("probabilities", [0.1, 0.7, 0.2], 0.7),
    ],
)
def test_live_probability_respects_output_type(monkeypatch, output_type, output, expected):
    monkeypatch.setattr(liveness.settings, "LIVENESS_OUTPUT_TYPE", output_type)
    monkeypatch.setattr(liveness.settings, "LIVENESS_LIVE_CLASS_INDEX", 1)

    assert liveness._live_probability(np.asarray(output)) == pytest.approx(expected, rel=1e-5)


def test_missing_model_fails_closed_outside_development(monkeypatch):
    monkeypatch.setattr(liveness.settings, "LIVENESS_MODELS", "/models/missing.onnx@2.7")
    monkeypatch.setattr(liveness.settings, "ENVIRONMENT", "production")

    with pytest.raises(liveness.HTTPException) as exc:
        liveness.check_liveness(np.zeros((100, 100, 3), dtype=np.uint8), face=None)

    assert exc.value.status_code == 503

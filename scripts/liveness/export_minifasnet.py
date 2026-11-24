"""Export the official Silent-Face-Anti-Spoofing MiniFASNet weights to ONNX.

Source: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing (Apache-2.0),
pinned to commit b6d5f04ad78778917853b25c778acef6d5626d15. Run through
scripts/liveness/build_models.sh, which downloads the pinned files, checks their
SHA-256 and runs this script in a throwaway container with PyTorch.

Model contract (matches upstream test.py, so ai_service must use the same):
- input  : float32 [1, 3, 80, 80], BGR, raw 0-255 values (no /255), NCHW
- crop   : bbox scaled 2.7x (MiniFASNetV2) / 4.0x (MiniFASNetV1SE), shifted
           inside the frame, resized to 80x80
- output : 3 logits; softmax class 1 = real face, 0 and 2 = spoof types
- fusion : average of both models' softmax
"""
import argparse
import hashlib
import importlib.util
from collections import OrderedDict
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

MODELS = {
    # output name: (upstream weight file, constructor, crop scale)
    "minifasnet_v2_2.7.onnx": ("2.7_80x80_MiniFASNetV2.pth", "MiniFASNetV2", 2.7),
    "minifasnet_v1se_4.0.onnx": ("4_0_0_80x80_MiniFASNetV1SE.pth", "MiniFASNetV1SE", 4.0),
}
# get_kernel(80, 80) in upstream src/utility.py
CONV6_KERNEL = ((80 + 15) // 16, (80 + 15) // 16)


def _load_model_lib(upstream: Path):
    spec = importlib.util.spec_from_file_location("MiniFASNet", upstream / "src/model_lib/MiniFASNet.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load(model_lib, constructor: str, weights: Path) -> torch.nn.Module:
    model = getattr(model_lib, constructor)(conv6_kernel=CONV6_KERNEL)
    # weights_only: the checkpoint is a plain state_dict, never unpickle code.
    state = torch.load(weights, map_location="cpu", weights_only=True)
    state = OrderedDict((key[7:] if key.startswith("module.") else key, value) for key, value in state.items())
    model.load_state_dict(state)
    return model.eval()


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    model_lib = _load_model_lib(args.upstream)
    args.out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    for output_name, (weight_file, constructor, scale) in MODELS.items():
        model = _load(model_lib, constructor, args.upstream / "resources/anti_spoof_models" / weight_file)
        target = args.out / output_name
        dummy = torch.zeros(1, 3, 80, 80)
        torch.onnx.export(
            model, dummy, str(target),
            input_names=["input"], output_names=["logits"],
            opset_version=13, do_constant_folding=True, dynamo=False,
        )

        # Parity check: ONNX Runtime must reproduce PyTorch on image-like inputs.
        session = ort.InferenceSession(str(target), providers=["CPUExecutionProvider"])
        batch = rng.integers(0, 256, size=(8, 1, 3, 80, 80)).astype(np.float32)
        worst = 0.0
        for sample in batch:
            with torch.no_grad():
                expected = torch.softmax(model(torch.from_numpy(sample)), dim=1).numpy()
            logits = session.run(None, {"input": sample})[0]
            actual = np.exp(logits - logits.max()) / np.exp(logits - logits.max()).sum()
            worst = max(worst, float(np.abs(expected - actual).max()))
        assert worst < 1e-4, f"{output_name}: ONNX deviates from PyTorch by {worst}"
        print(f"{output_name}: scale={scale} max|torch-onnx|={worst:.2e} sha256={_sha256(target)}")


if __name__ == "__main__":
    main()

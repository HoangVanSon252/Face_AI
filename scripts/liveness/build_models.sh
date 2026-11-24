#!/usr/bin/env sh
# Build the MiniFASNet anti-spoofing ONNX models into ai_service/models/.
# Usage (from the repository root): sh scripts/liveness/build_models.sh
# Requires Docker and network access; nothing is installed on the host.
set -eu

COMMIT=b6d5f04ad78778917853b25c778acef6d5626d15
BASE="https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/$COMMIT"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# Work inside the repo (git-ignored) so Docker Desktop on Windows can mount it.
WORK="$ROOT/.cache/liveness-build"
rm -rf "$WORK" && mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT
# Git Bash: give Docker a Windows path (D:/...); MSYS_NO_PATHCONV below stops it
# rewriting the container-side paths. On Linux/macOS this is plain pwd.
host_path() { (cd "$1" && pwd -W) 2>/dev/null || (cd "$1" && pwd); }

fetch() {
    mkdir -p "$WORK/upstream/$(dirname "$1")"
    curl -fsSL -o "$WORK/upstream/$1" "$BASE/$1"
}

fetch src/model_lib/MiniFASNet.py
fetch LICENSE
fetch resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth
fetch resources/anti_spoof_models/4_0_0_80x80_MiniFASNetV1SE.pth

# Pinned checksums of the upstream weights at $COMMIT.
cd "$WORK/upstream/resources/anti_spoof_models"
sha256sum -c - <<'EOF'
a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0  2.7_80x80_MiniFASNetV2.pth
84ee1d37d96894d5e82de5a57df044ef80a58be2b218b5ed7cdfd875ec2f5990  4_0_0_80x80_MiniFASNetV1SE.pth
EOF
cd "$ROOT"

MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$(host_path "$WORK/upstream"):/upstream:ro" \
    -v "$(host_path "$ROOT/scripts/liveness"):/scripts:ro" \
    -v "$(host_path "$ROOT/ai_service/models"):/out" \
    python:3.11-slim sh -c "\
        pip install --quiet --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 && \
        pip install --quiet --no-cache-dir onnx==1.17.0 onnxruntime==1.20.1 'numpy<2.2' && \
        python -I /scripts/export_minifasnet.py --upstream /upstream --out /out"

cp "$WORK/upstream/LICENSE" "$ROOT/ai_service/models/MiniFASNet-LICENSE.txt"
echo "Done. Set LIVENESS_MODELS in .env (see .env.example)."

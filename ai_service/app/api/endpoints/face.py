from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.engine.detector import decode_base64_image
from app.engine.liveness import check_liveness
from app.engine.recognizer import detect_faces, estimate_quality
from app.schemas.face import (
    DetectResponse,
    EmbeddingResponse,
    FaceDetection,
    ImageRequest,
    LivenessResponse,
)

router = APIRouter(prefix="/face", tags=["face"])


def _face_crop(image, face):
    """Use the detected face, with a small margin, instead of the whole webcam frame."""
    height, width = image.shape[:2]
    x1, y1, x2, y2 = (float(value) for value in face.bbox)
    margin_x = (x2 - x1) * 0.15
    margin_y = (y2 - y1) * 0.15
    left, top = max(0, int(x1 - margin_x)), max(0, int(y1 - margin_y))
    right, bottom = min(width, int(x2 + margin_x)), min(height, int(y2 + margin_y))
    return image[top:bottom, left:right]


@router.post("/detect", response_model=DetectResponse)
def detect(request: ImageRequest) -> DetectResponse:
    image = decode_base64_image(request.image_base64)
    faces = detect_faces(image)

    return DetectResponse(
        face_count=len(faces),
        faces=[
            FaceDetection(
                bbox=[round(float(value), 2) for value in face.bbox],
                confidence=round(float(face.det_score), 4),
            )
            for face in faces
        ],
    )


@router.post("/embedding", response_model=EmbeddingResponse)
def extract_embedding(request: ImageRequest) -> EmbeddingResponse:
    image = decode_base64_image(request.image_base64)
    faces = detect_faces(image)

    if len(faces) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No face detected",
        )

    if len(faces) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Exactly one face must be present in the image",
        )

    face = faces[0]
    embedding = getattr(face, "normed_embedding", None)

    if embedding is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding model is unavailable",
        )

    return EmbeddingResponse(
        embedding=[round(float(value), 8) for value in embedding],
        dimension=len(embedding),
        quality_score=estimate_quality(face, image),
        detection_confidence=round(float(face.det_score), 4),
        bbox=[round(float(value), 2) for value in face.bbox],
    )


@router.post("/liveness", response_model=LivenessResponse)
def liveness(request: ImageRequest) -> LivenessResponse:
    image = decode_base64_image(request.image_base64)
    faces = detect_faces(image)
    if len(faces) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Exactly one face must be present for liveness verification",
        )
    is_live, score = check_liveness(_face_crop(image, faces[0]), face=faces[0])
    is_configured = bool(settings.liveness_model_file and settings.liveness_model_file.is_file())

    return LivenessResponse(
        available=is_configured,
        is_live=is_live,
        score=score,
        reason=None if is_configured else "Evaluated via face detection heuristic (ONNX model file not configured)",
    )

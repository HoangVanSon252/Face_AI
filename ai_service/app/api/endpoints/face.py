from fastapi import APIRouter, HTTPException, status

from app.engine.detector import decode_base64_image
from app.engine.liveness import check_liveness, models_configured
from app.engine.recognizer import detect_faces, estimate_quality
from app.schemas.face import (
    AnalyzeResponse,
    DetectResponse,
    EmbeddingResponse,
    FaceDetection,
    ImageRequest,
    LivenessResponse,
)

router = APIRouter(prefix="/face", tags=["face"])


def _single_face(image, detail: str):
    faces = detect_faces(image)
    if len(faces) == 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No face detected")
    if len(faces) > 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
    return faces[0]


def _embedding(face) -> list[float]:
    embedding = getattr(face, "normed_embedding", None)
    if embedding is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding model is unavailable",
        )
    return [round(float(value), 8) for value in embedding]


def _liveness(image, face) -> LivenessResponse:
    is_live, score = check_liveness(image, face)
    is_configured = models_configured()
    return LivenessResponse(
        available=is_configured,
        is_live=is_live,
        score=score,
        reason=None if is_configured else "Development heuristic; configure LIVENESS_MODELS for production",
    )


def _bbox(face) -> list[float]:
    return [round(float(value), 2) for value in face.bbox]


@router.post("/detect", response_model=DetectResponse)
def detect(request: ImageRequest) -> DetectResponse:
    image = decode_base64_image(request.image_base64)
    faces = detect_faces(image)

    return DetectResponse(
        face_count=len(faces),
        faces=[
            FaceDetection(
                bbox=_bbox(face),
                confidence=round(float(face.det_score), 4),
                landmarks=[
                    [round(float(point[0]), 2), round(float(point[1]), 2)]
                    for point in getattr(face, "kps", [])
                ],
            )
            for face in faces
        ],
    )


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: ImageRequest) -> AnalyzeResponse:
    """Decode and detect once, then return both embedding and liveness for the face."""
    image = decode_base64_image(request.image_base64)
    face = _single_face(image, "Exactly one face must be present in the image")
    embedding = _embedding(face)
    return AnalyzeResponse(
        embedding=embedding,
        dimension=len(embedding),
        quality_score=estimate_quality(face, image),
        detection_confidence=round(float(face.det_score), 4),
        bbox=_bbox(face),
        liveness=_liveness(image, face),
    )


@router.post("/embedding", response_model=EmbeddingResponse)
def extract_embedding(request: ImageRequest) -> EmbeddingResponse:
    image = decode_base64_image(request.image_base64)
    face = _single_face(image, "Exactly one face must be present in the image")
    embedding = _embedding(face)

    return EmbeddingResponse(
        embedding=embedding,
        dimension=len(embedding),
        quality_score=estimate_quality(face, image),
        detection_confidence=round(float(face.det_score), 4),
        bbox=_bbox(face),
    )


@router.post("/liveness", response_model=LivenessResponse)
def liveness(request: ImageRequest) -> LivenessResponse:
    image = decode_base64_image(request.image_base64)
    face = _single_face(image, "Exactly one face must be present for liveness verification")
    return _liveness(image, face)

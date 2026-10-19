from datetime import datetime
from math import sqrt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api import dependencies
from app.core.config import settings
from app.crud import crud_attendance, crud_face
from app.models.attendance import AttendanceRecord, AttendanceStatusEnum, ReviewStatusEnum, SessionStatusEnum, VerificationMethodEnum
from app.models.face import FaceEmbedding, FaceProfile, FaceProfileStatusEnum
from app.models.user import RoleEnum, Student
from app.schemas.face import EvidenceUrlResponse, FaceProfileCreate, FaceProfileResponse, RecognitionRequest, RecognitionResponse
from app.services.ai_client import check_liveness, extract_embedding, detect_faces_fast
from app.services.audit_service import write_audit_log
from app.services.realtime import realtime_service
from app.services.object_storage import create_download_url, upload_attendance_evidence

router = APIRouter()
STAFF = [RoleEnum.ADMIN.value, RoleEnum.LECTURER.value]


def _profile_response(profile: FaceProfile) -> FaceProfileResponse:
    return FaceProfileResponse(
        id=profile.id, student_id=profile.student_id, status=profile.status,
        sample_count=len(profile.embeddings), model_name=profile.model_name,
        model_version=profile.model_version, embedding_dimension=profile.embedding_dimension,
        consent_at=profile.consent_at, activated_at=profile.activated_at,
    )


@router.post("/students/{student_id}/face-profiles", response_model=FaceProfileResponse, status_code=201)
async def enroll_face_profile(student_id: int, data: FaceProfileCreate, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.get_current_active_user)):
    dependencies.require_student_access(db, student_id, current_user)
    if db.get(Student, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not found")
    accepted: list[dict] = []
    for sample in data.samples[:settings.FACE_MAX_SAMPLES]:
        # Enrollment is also a biometric verification event: reject replayed
        # photos instead of creating a profile from an unverified image.
        liveness = check_liveness(sample.image_base64)
        if not liveness.get("is_live"):
            continue
        result = extract_embedding(sample.image_base64)
        if float(result["quality_score"]) >= settings.FACE_MIN_QUALITY_SCORE:
            accepted.append({**result, "is_primary": sample.is_primary})
    if len(accepted) < settings.FACE_MIN_SAMPLES:
        raise HTTPException(
            status_code=422,
            detail=f"At least {settings.FACE_MIN_SAMPLES} live, high-quality face samples are required",
        )
    old = crud_face.active_profile(db, student_id)
    if old:
        old.status = FaceProfileStatusEnum.REVOKED
        old.revoked_at = datetime.utcnow()
    profile = crud_face.create_profile(db, student_id, current_user.id, int(accepted[0]["dimension"]))
    for index, item in enumerate(accepted):
        crud_face.add_embedding(db, profile.id, item["embedding"], float(item["quality_score"]), item["is_primary"] or index == 0)
    profile.status = FaceProfileStatusEnum.ACTIVE
    profile.activated_at = datetime.utcnow()
    write_audit_log(db, action="FACE_PROFILE_ENROLLED", actor_user_id=current_user.id, entity_type="FACE_PROFILE", entity_id=profile.id, details={"student_id": student_id, "sample_count": len(accepted)})
    db.commit()
    db.refresh(profile)
    return _profile_response(profile)


@router.get("/students/me/face-profile", response_model=FaceProfileResponse)
def get_my_face_profile(
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.get_current_active_user),
):
    profile = (
        db.query(FaceProfile)
        .options(joinedload(FaceProfile.embeddings))
        .filter(FaceProfile.student_id == current_user.id, FaceProfile.status == FaceProfileStatusEnum.ACTIVE)
        .first()
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Active face profile not found")
    return _profile_response(profile)


@router.post("/face/detect-frame")
def detect_frame(
    data: RecognitionRequest,
    current_user=Depends(dependencies.get_current_active_user),
):
    """Fast frame check for auto-capture hands-free guidance."""
    res = detect_faces_fast(data.image_base64)
    face_count = int(res.get("face_count", 0))
    faces = res.get("faces", [])
    confidence = max([float(f.get("confidence", 0.0)) for f in faces], default=0.0) if faces else 0.0
    return {
        "detected": face_count > 0,
        "face_count": face_count,
        "confidence": round(confidence, 4),
        "faces": faces,
    }


@router.get("/students/{student_id}/face-profile", response_model=FaceProfileResponse)
def get_face_profile(student_id: int, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.get_current_active_user)):
    dependencies.require_student_access(db, student_id, current_user)
    profile = db.query(FaceProfile).options(joinedload(FaceProfile.embeddings)).filter(FaceProfile.student_id == student_id, FaceProfile.status == FaceProfileStatusEnum.ACTIVE).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="Active face profile not found")
    return _profile_response(profile)


@router.get("/attendance/{record_id}/evidence-url", response_model=EvidenceUrlResponse)
def get_evidence_url(
    record_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    """Staff may view evidence through a five-minute S3 presigned URL."""
    record = dependencies.require_record_staff_access(db, record_id, current_user)
    if not record.evidence_image_uri:
        raise HTTPException(status_code=404, detail="No evidence image is available")
    return EvidenceUrlResponse(
        url=create_download_url(record.evidence_image_uri),
        expires_in_seconds=300,
    )


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    norm = sqrt(sum(a * a for a in left)) * sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0


@router.post("/sessions/{session_id}/recognitions", response_model=RecognitionResponse, status_code=201)
async def recognize(session_id: int, data: RecognitionRequest, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.require_role(STAFF))):
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.OPEN:
        raise HTTPException(status_code=409, detail="Attendance session is not open")
    try:
        result = extract_embedding(data.image_base64)
    except HTTPException as exc:
        if exc.status_code == 422:
            return RecognitionResponse(
                matched=False,
                quality_score=0.0,
                review_required=False,
                reason=exc.detail or "No face detected in frame",
            )
        raise

    try:
        liveness = check_liveness(data.image_base64)
    except HTTPException as exc:
        if exc.status_code == 422:
            return RecognitionResponse(
                matched=False,
                quality_score=float(result.get("quality_score", 0.0)),
                review_required=False,
                reason=exc.detail or "Liveness verification could not isolate face",
            )
        raise

    liveness_score = float(liveness["score"])
    if not liveness.get("is_live"):
        return RecognitionResponse(
            matched=False,
            quality_score=float(result["quality_score"]),
            review_required=True,
            reason="Liveness verification rejected this frame",
        )
    query_embedding = result["embedding"]
    candidates = db.query(FaceEmbedding, FaceProfile.student_id).join(FaceProfile).filter(FaceProfile.status == FaceProfileStatusEnum.ACTIVE).all()
    best = max((( _cosine(query_embedding, row.embedding_data), student_id) for row, student_id in candidates if len(row.embedding_data) == len(query_embedding)), default=None)
    quality = float(result["quality_score"])
    if best is None or best[0] < settings.FACE_MATCH_THRESHOLD:
        return RecognitionResponse(matched=False, quality_score=quality, review_required=True, reason="No face profile met the matching threshold")
    confidence, student_id = best
    if not crud_attendance.is_enrolled(db, session.section_id, student_id):
        return RecognitionResponse(matched=False, quality_score=quality, review_required=True, reason="Matched student is not enrolled")

    already_checked_in = (
        db.query(AttendanceRecord.id)
        .filter(
            AttendanceRecord.session_id == session_id,
            AttendanceRecord.student_id == student_id,
        )
        .first()
    )
    if already_checked_in:
        raise HTTPException(status_code=409, detail="Student has already checked in")

    # Store evidence only for a matched, enrolled student; never retain every webcam frame.
    evidence_uri, _checksum = upload_attendance_evidence(session_id, data.image_base64)
    auto_approved = confidence >= settings.FACE_AUTO_APPROVE_THRESHOLD
    checked_in_at = datetime.utcnow()
    try:
        attendance_status = crud_attendance.attendance_status_for_check_in(session, checked_in_at)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    record = AttendanceRecord(
        session_id=session_id,
        student_id=student_id,
        status=attendance_status,
        verification_method=VerificationMethodEnum.FACE,
        check_in_at=checked_in_at,
        confidence_score=confidence,
        liveness_score=liveness_score,
        review_status=ReviewStatusEnum.AUTO_APPROVED if auto_approved else ReviewStatusEnum.PENDING,
        evidence_image_uri=evidence_uri,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Student has already checked in")
    db.refresh(record)
    await realtime_service.publish(session_id, "attendance_detected", {"record_id": record.id, "student_id": student_id, "status": record.status.value, "confidence_score": confidence, "review_required": not auto_approved})
    return RecognitionResponse(matched=True, student_id=student_id, attendance_record_id=record.id, confidence_score=confidence, quality_score=quality, review_required=not auto_approved)

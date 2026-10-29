from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api import dependencies
from app.core.config import settings
from app.core.limiter import limiter, session_key, user_key
from app.crud import crud_attendance, crud_face
from app.models.attendance import AttendanceRecord, AttendanceStatusEnum, ReviewStatusEnum, SessionStatusEnum, VerificationMethodEnum
from app.models.face import FaceProfile, FaceProfileStatusEnum
from app.models.user import RoleEnum, Student
from app.schemas.face import EvidenceUrlResponse, FaceProfileCreate, FaceProfileResponse, RecognitionRequest, RecognitionResponse
from app.services.ai_client import analyze_face, detect_faces_fast
from app.services.audit_service import write_audit_log
from app.services.realtime import realtime_service
from app.services.face_matcher import best_match
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
@limiter.limit(settings.RATE_LIMIT_FACE_ENROLL, key_func=user_key)
def enroll_face_profile(request: Request, student_id: int, data: FaceProfileCreate, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.get_current_active_user)):
    dependencies.require_student_access(db, student_id, current_user)
    if db.get(Student, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not found")
    accepted: list[dict] = []
    for sample in data.samples[:settings.FACE_MAX_SAMPLES]:
        # Enrollment is also a biometric verification event: reject replayed
        # photos instead of creating a profile from an unverified image.
        result = analyze_face(sample.image_base64)
        if not result["liveness"].get("is_live"):
            continue
        if float(result["quality_score"]) >= settings.FACE_MIN_QUALITY_SCORE:
            accepted.append({**result, "is_primary": sample.is_primary})
    if len(accepted) < settings.FACE_MIN_SAMPLES:
        raise HTTPException(
            status_code=422,
            detail=f"At least {settings.FACE_MIN_SAMPLES} live, high-quality face samples are required",
        )
    # Re-enrollment: the previous samples are no longer needed, erase them.
    crud_face.erase_face_data(db, student_id, revoke_consent=False)
    crud_face.record_consent(
        db, student_id, current_user.id, settings.BIOMETRIC_POLICY_VERSION,
        request.client.host if request.client else None, request.headers.get("user-agent"),
    )
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
@limiter.limit(settings.RATE_LIMIT_FACE_DETECT, key_func=user_key)
def detect_frame(
    request: Request,
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


@router.delete("/students/{student_id}/face-profile", status_code=204)
def erase_face_profile(
    request: Request,
    student_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.get_current_active_user),
):
    """Withdraw biometric consent: erase all face embeddings of the student.
    Only the student themself or an admin may do this."""
    is_self = current_user.role == RoleEnum.STUDENT and current_user.id == student_id
    if not (is_self or current_user.role == RoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail="Only the student or an administrator can erase face data")
    if db.get(Student, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not found")
    erased = crud_face.erase_face_data(db, student_id, revoke_consent=True)
    write_audit_log(
        db, action="FACE_DATA_ERASED", actor_user_id=current_user.id, entity_type="STUDENT", entity_id=student_id,
        request=request, details={"student_id": student_id, "embeddings_erased": erased},
    )
    db.commit()


@router.get("/attendance/{record_id}/evidence-url", response_model=EvidenceUrlResponse)
def get_evidence_url(
    request: Request,
    record_id: int,
    db: Session = Depends(dependencies.get_db),
    current_user=Depends(dependencies.require_role(STAFF)),
):
    """Staff may view evidence through a five-minute S3 presigned URL. Every view is audited."""
    record = dependencies.require_record_staff_access(db, record_id, current_user)
    if not record.evidence_image_uri:
        raise HTTPException(status_code=404, detail="No evidence image is available")
    write_audit_log(
        db, action="EVIDENCE_VIEWED", actor_user_id=current_user.id, entity_type="ATTENDANCE_RECORD", entity_id=record.id,
        request=request, details={"session_id": record.session_id, "student_id": record.student_id}, commit=True,
    )
    return EvidenceUrlResponse(
        url=create_download_url(record.evidence_image_uri),
        expires_in_seconds=300,
    )


def _recognize(session_id: int, data: RecognitionRequest, db: Session, current_user) -> tuple[RecognitionResponse, dict | None]:
    """Blocking part of recognition (DB, AI, object storage); runs in the threadpool."""
    session = dependencies.require_session_access(db, session_id, current_user)
    if session.status != SessionStatusEnum.OPEN:
        raise HTTPException(status_code=409, detail="Attendance session is not open")
    # Return the DB connection to the pool while waiting for the AI (up to a few
    # seconds under load); it is checked out again for the writes below.
    db.rollback()
    try:
        result = analyze_face(data.image_base64)
    except HTTPException as exc:
        if exc.status_code == 422:
            return RecognitionResponse(
                matched=False,
                quality_score=0.0,
                review_required=False,
                reason=exc.detail or "No face detected in frame",
            ), None
        raise

    quality = float(result["quality_score"])
    liveness = result["liveness"]
    liveness_score = float(liveness["score"])
    if not liveness.get("is_live"):
        return RecognitionResponse(
            matched=False,
            quality_score=quality,
            review_required=True,
            reason="Liveness verification rejected this frame",
        ), None
    # Candidates are limited to students enrolled in this section.
    best = best_match(db, session.section_id, result["embedding"])
    if best is None or best[0] < settings.FACE_MATCH_THRESHOLD:
        return RecognitionResponse(matched=False, quality_score=quality, review_required=True, reason="No face profile met the matching threshold"), None
    confidence, student_id = best

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

    auto_approved = confidence >= settings.FACE_AUTO_APPROVE_THRESHOLD
    checked_in_at = datetime.utcnow()
    try:
        attendance_status = crud_attendance.attendance_status_for_check_in(session, checked_in_at)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    # Store evidence only once the check-in will be recorded; never retain every webcam frame.
    evidence_uri, _checksum = upload_attendance_evidence(session_id, data.image_base64)
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
    event = {"record_id": record.id, "student_id": student_id, "status": record.status.value, "confidence_score": confidence, "review_required": not auto_approved}
    response = RecognitionResponse(matched=True, student_id=student_id, attendance_record_id=record.id, confidence_score=confidence, quality_score=quality, review_required=not auto_approved)
    return response, event


@router.post("/sessions/{session_id}/recognitions", response_model=RecognitionResponse, status_code=201)
@limiter.limit(settings.RATE_LIMIT_FACE_RECOGNIZE, key_func=session_key)
async def recognize(request: Request, session_id: int, data: RecognitionRequest, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.require_role(STAFF))):
    # Sync DB/HTTP/S3 calls must not block the event loop shared by every request.
    response, event = await run_in_threadpool(_recognize, session_id, data, db, current_user)
    if event is not None:
        await realtime_service.publish(session_id, "attendance_detected", event)
    return response

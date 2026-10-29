"""Daily data-retention job (runs in the `maintenance` compose service).

- Attendance evidence photos older than EVIDENCE_RETENTION_DAYS are deleted from
  object storage and unlinked from their records (the attendance result stays);
  photos of records with a pending appeal are kept until the appeal is resolved.
- Embeddings left on REVOKED face profiles are erased (data minimisation).
- Refresh tokens expired for more than 30 days are purged.

Usage: python -m app.jobs.maintenance [--once]
"""
import argparse
import logging
import time
from datetime import datetime, timedelta

from botocore.exceptions import ClientError

from app.core.logging import setup_logging
from app.database import SessionLocal
from app.models.attendance import AppealStatusEnum, AttendanceAppeal, AttendanceRecord
from app.models.face import FaceEmbedding, FaceProfile, FaceProfileStatusEnum
from app.models.token import RefreshToken
from app.core.config import settings
from app.services.audit_service import write_audit_log
from app.services.object_storage import delete_object

logger = logging.getLogger("face_attendance")
BATCH_SIZE = 500
RUN_INTERVAL_SECONDS = 24 * 60 * 60


def purge_expired_evidence(db, now: datetime) -> int:
    if settings.EVIDENCE_RETENTION_DAYS <= 0:
        return 0
    cutoff = now - timedelta(days=settings.EVIDENCE_RETENTION_DAYS)
    purged = 0
    while True:
        # Evidence is uploaded when the record is created; keep it while an appeal is open.
        open_appeals = db.query(AttendanceAppeal.attendance_record_id).filter(AttendanceAppeal.status == AppealStatusEnum.PENDING)
        records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.evidence_image_uri.isnot(None),
                AttendanceRecord.created_at < cutoff,
                AttendanceRecord.id.notin_(open_appeals),
            )
            .limit(BATCH_SIZE)
            .all()
        )
        if not records:
            return purged
        for record in records:
            try:
                delete_object(record.evidence_image_uri)
            except ClientError:
                # Leave the link so the next run retries; S3 delete of a missing key succeeds.
                logger.warning("evidence_delete_failed", extra={"record_id": record.id})
                continue
            record.evidence_image_uri = None
            purged += 1
        db.commit()
        if len(records) < BATCH_SIZE:
            return purged


def purge_revoked_embeddings(db) -> int:
    revoked = db.query(FaceProfile.id).filter(FaceProfile.status == FaceProfileStatusEnum.REVOKED)
    erased = db.query(FaceEmbedding).filter(FaceEmbedding.face_profile_id.in_(revoked)).delete(synchronize_session=False)
    db.commit()
    return erased


def purge_expired_refresh_tokens(db, now: datetime) -> int:
    removed = 0
    while True:
        # Ids first: MySQL rejects a subquery on the table being updated (error 1093).
        expired = [
            row.id
            for row in db.query(RefreshToken.id).filter(RefreshToken.expires_at < now - timedelta(days=30)).limit(BATCH_SIZE)
        ]
        if not expired:
            return removed
        # Clear self-references first so rows can be deleted in any order.
        db.query(RefreshToken).filter(RefreshToken.replaced_by_token_id.in_(expired)).update(
            {"replaced_by_token_id": None}, synchronize_session=False
        )
        removed += db.query(RefreshToken).filter(RefreshToken.id.in_(expired)).delete(synchronize_session=False)
        db.commit()


def run_once() -> dict[str, int]:
    now = datetime.utcnow()
    db = SessionLocal()
    try:
        summary = {
            "evidence_purged": purge_expired_evidence(db, now),
            "revoked_embeddings_erased": purge_revoked_embeddings(db),
            "refresh_tokens_purged": purge_expired_refresh_tokens(db, now),
        }
        write_audit_log(db, action="DATA_RETENTION_RUN", entity_type="SYSTEM", details=summary, commit=True)
        logger.info("data_retention_run", extra=summary)
        return summary
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    args = parser.parse_args()
    setup_logging()
    while True:
        try:
            print(run_once(), flush=True)
        except Exception:
            logger.exception("data_retention_failed")
            if args.once:
                raise
        if args.once:
            return
        time.sleep(RUN_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

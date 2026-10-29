"""biometric consent records and encrypted face embeddings

Revision ID: e1f2a3b4c5d6
Revises: d9e5a1c2b6f8

Data step: encrypts every legacy plaintext embedding with FACE_EMBEDDING_KEY
(AES-256-GCM, see app/core/biometric_crypto.py). Without the key the data step
is skipped and existing rows stay readable as plaintext until it is configured.
"""
import logging

from alembic import op
import sqlalchemy as sa

revision = "e1f2a3b4c5d6"
down_revision = "d9e5a1c2b6f8"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

_embeddings = sa.table(
    "face_embeddings",
    sa.column("id", sa.BigInteger),
    sa.column("embedding_data", sa.JSON),
)


def _rewrite(transform, predicate) -> int:
    connection = op.get_bind()
    rows = connection.execute(sa.select(_embeddings.c.id, _embeddings.c.embedding_data)).all()
    changed = 0
    for row_id, data in rows:
        if predicate(data):
            connection.execute(
                _embeddings.update().where(_embeddings.c.id == row_id).values(embedding_data=transform(data))
            )
            changed += 1
    return changed


def upgrade():
    op.create_table(
        "biometric_consents",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("student_id", sa.BigInteger(), sa.ForeignKey("students.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("policy_version", sa.String(30), nullable=False),
        sa.Column("granted_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("granted_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_biometric_consents_student_id", "biometric_consents", ["student_id"])

    from app.core.biometric_crypto import encrypt_embedding
    from app.core.config import settings

    if not settings.FACE_EMBEDDING_KEY:
        logger.warning("FACE_EMBEDDING_KEY not set: legacy face embeddings left unencrypted")
        return
    count = _rewrite(encrypt_embedding, lambda data: isinstance(data, list))
    logger.info("encrypted %s legacy face embeddings", count)


def downgrade():
    from app.core.biometric_crypto import decrypt_embedding, is_encrypted

    _rewrite(decrypt_embedding, is_encrypted)
    op.drop_index("ix_biometric_consents_student_id", table_name="biometric_consents")
    op.drop_table("biometric_consents")

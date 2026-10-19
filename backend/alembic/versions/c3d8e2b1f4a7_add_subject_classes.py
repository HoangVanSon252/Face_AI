"""link subjects to student classes

Revision ID: c3d8e2b1f4a7
Revises: b9e4d8c1a5f0
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d8e2b1f4a7"
down_revision = "b9e4d8c1a5f0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "subject_classes",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.BigInteger(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_id", sa.BigInteger(), sa.ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("course_id", "section_id", name="uk_subject_classes_course_section"),
    )


def downgrade():
    op.drop_table("subject_classes")

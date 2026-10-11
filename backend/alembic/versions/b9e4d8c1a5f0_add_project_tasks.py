"""add project tasks

Revision ID: b9e4d8c1a5f0
Revises: 77b57ff48a64
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b9e4d8c1a5f0"
down_revision: Union[str, None] = "77b57ff48a64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_tasks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.Enum("TODO", "IN_PROGRESS", "BLOCKED", "DONE", name="projecttaskstatusenum"), nullable=False),
        sa.Column("priority", sa.Enum("LOW", "MEDIUM", "HIGH", name="projecttaskpriorityenum"), nullable=False),
        sa.Column("assignee_user_id", sa.BigInteger(), nullable=True),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["assignee_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("project_tasks")

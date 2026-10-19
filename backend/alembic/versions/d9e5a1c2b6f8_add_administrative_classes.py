"""add administrative classes

Revision ID: d9e5a1c2b6f8
Revises: c3d8e2b1f4a7
"""
from alembic import op
import sqlalchemy as sa

revision = "d9e5a1c2b6f8"
down_revision = "c3d8e2b1f4a7"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("administrative_classes", sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True), sa.Column("code", sa.String(50), nullable=False, unique=True), sa.Column("name", sa.String(150), nullable=True), sa.Column("department", sa.String(150), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))

def downgrade(): op.drop_table("administrative_classes")

"""Add face_embedding to users.

Revision ID: 20260213d1e2
Revises: 20260213c1d2
Create Date: 2026-02-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260213d1e2"
down_revision = "20260213c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("face_embedding", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "face_embedding")

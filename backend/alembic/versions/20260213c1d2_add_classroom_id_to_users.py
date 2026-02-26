"""Add classroom_id to users.

Revision ID: 20260213c1d2
Revises: 20260213b1c2
Create Date: 2026-02-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260213c1d2"
down_revision = "20260213b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("classroom_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_users_classroom_id",
        "users",
        "classrooms",
        ["classroom_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_classroom_id", "users", ["classroom_id"])


def downgrade() -> None:
    op.drop_index("ix_users_classroom_id", table_name="users")
    op.drop_constraint("fk_users_classroom_id", "users", type_="foreignkey")
    op.drop_column("users", "classroom_id")

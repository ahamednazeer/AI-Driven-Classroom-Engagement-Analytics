"""Add class_section to users.

Revision ID: 20260213a1b2
Revises: None
Create Date: 2026-02-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260213a1b2"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("class_section", sa.String(length=50), nullable=True))
    op.create_index("ix_users_class_section", "users", ["class_section"])


def downgrade() -> None:
    op.drop_index("ix_users_class_section", table_name="users")
    op.drop_column("users", "class_section")

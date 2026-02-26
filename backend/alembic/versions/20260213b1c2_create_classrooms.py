"""Create classrooms table.

Revision ID: 20260213b1c2
Revises: 20260213a1b2
Create Date: 2026-02-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260213b1c2"
down_revision = "20260213a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "classrooms",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("department", sa.String(length=100), nullable=True),
        sa.Column("section", sa.String(length=50), nullable=True),
        sa.Column("batch", sa.String(length=20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_classrooms_name", "classrooms", ["name"], unique=True)
    op.create_index("ix_classrooms_department", "classrooms", ["department"])
    op.create_index("ix_classrooms_section", "classrooms", ["section"])
    op.create_index("ix_classrooms_batch", "classrooms", ["batch"])
    op.create_index("ix_classrooms_teacher_id", "classrooms", ["teacher_id"])
    op.create_index("ix_classrooms_department_section", "classrooms", ["department", "section"])


def downgrade() -> None:
    op.drop_index("ix_classrooms_department_section", table_name="classrooms")
    op.drop_index("ix_classrooms_teacher_id", table_name="classrooms")
    op.drop_index("ix_classrooms_batch", table_name="classrooms")
    op.drop_index("ix_classrooms_section", table_name="classrooms")
    op.drop_index("ix_classrooms_department", table_name="classrooms")
    op.drop_index("ix_classrooms_name", table_name="classrooms")
    op.drop_table("classrooms")

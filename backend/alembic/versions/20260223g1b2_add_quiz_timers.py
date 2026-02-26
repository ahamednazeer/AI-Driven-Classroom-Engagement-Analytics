"""Add timer fields to session quizzes.

Revision ID: 20260223g1b2
Revises: 20260223f1a2
Create Date: 2026-02-23 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260223g1b2"
down_revision = "20260223f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "session_quizzes",
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="60"),
    )
    op.add_column(
        "session_quizzes",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_session_quizzes_expires_at", "session_quizzes", ["expires_at"])
    op.alter_column("session_quizzes", "duration_seconds", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_session_quizzes_expires_at", table_name="session_quizzes")
    op.drop_column("session_quizzes", "expires_at")
    op.drop_column("session_quizzes", "duration_seconds")

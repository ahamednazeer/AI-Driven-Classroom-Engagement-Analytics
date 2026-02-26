"""Add session quiz and response tables.

Revision ID: 20260223f1a2
Revises: 20260213e1f2
Create Date: 2026-02-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260223f1a2"
down_revision = "20260213e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_quizzes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("question", sa.String(length=500), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("correct_option_index", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_session_quizzes_session_id", "session_quizzes", ["session_id"])
    op.create_index("ix_session_quizzes_teacher_id", "session_quizzes", ["teacher_id"])
    op.create_index("ix_session_quizzes_is_active", "session_quizzes", ["is_active"])
    op.create_index("ix_session_quiz_session_active", "session_quizzes", ["session_id", "is_active"])

    op.create_table(
        "session_quiz_responses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("session_quizzes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("selected_option_index", sa.Integer(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_session_quiz_responses_quiz_id", "session_quiz_responses", ["quiz_id"])
    op.create_index("ix_session_quiz_responses_session_id", "session_quiz_responses", ["session_id"])
    op.create_index("ix_session_quiz_responses_student_id", "session_quiz_responses", ["student_id"])
    op.create_index("ix_session_quiz_responses_answered_at", "session_quiz_responses", ["answered_at"])
    op.create_unique_constraint("uq_quiz_student", "session_quiz_responses", ["quiz_id", "student_id"])
    op.create_index("ix_quiz_response_session_student", "session_quiz_responses", ["session_id", "student_id"])


def downgrade() -> None:
    op.drop_index("ix_quiz_response_session_student", table_name="session_quiz_responses")
    op.drop_constraint("uq_quiz_student", "session_quiz_responses", type_="unique")
    op.drop_index("ix_session_quiz_responses_answered_at", table_name="session_quiz_responses")
    op.drop_index("ix_session_quiz_responses_student_id", table_name="session_quiz_responses")
    op.drop_index("ix_session_quiz_responses_session_id", table_name="session_quiz_responses")
    op.drop_index("ix_session_quiz_responses_quiz_id", table_name="session_quiz_responses")
    op.drop_table("session_quiz_responses")

    op.drop_index("ix_session_quiz_session_active", table_name="session_quizzes")
    op.drop_index("ix_session_quizzes_is_active", table_name="session_quizzes")
    op.drop_index("ix_session_quizzes_teacher_id", table_name="session_quizzes")
    op.drop_index("ix_session_quizzes_session_id", table_name="session_quizzes")
    op.drop_table("session_quizzes")

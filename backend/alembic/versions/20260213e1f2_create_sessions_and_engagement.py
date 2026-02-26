"""Create session and engagement tables.

Revision ID: 20260213e1f2
Revises: 20260213d1e2
Create Date: 2026-02-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260213e1f2"
down_revision = "20260213d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "class_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_code", sa.String(length=20), nullable=False),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("classrooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("course", sa.String(length=120), nullable=False),
        sa.Column("subject", sa.String(length=120), nullable=False),
        sa.Column("topic", sa.String(length=200), nullable=False),
        sa.Column("scheduled_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tracking_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_class_sessions_session_code", "class_sessions", ["session_code"], unique=True)
    op.create_index("ix_class_sessions_class_id", "class_sessions", ["class_id"])
    op.create_index("ix_class_sessions_teacher_id", "class_sessions", ["teacher_id"])
    op.create_index("ix_class_sessions_status", "class_sessions", ["status"])
    op.create_index("ix_sessions_teacher_status", "class_sessions", ["teacher_id", "status"])
    op.create_index("ix_sessions_class_status", "class_sessions", ["class_id", "status"])

    op.create_table(
        "session_participants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attendance_mark", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("auth_type", sa.String(length=20), nullable=True),
        sa.Column("device_info", sa.JSON(), nullable=True),
    )
    op.create_index("ix_session_participants_session_id", "session_participants", ["session_id"])
    op.create_index("ix_session_participants_student_id", "session_participants", ["student_id"])
    op.create_unique_constraint("uq_session_student", "session_participants", ["session_id", "student_id"])
    op.create_index("ix_session_participant_session_student", "session_participants", ["session_id", "student_id"])

    op.create_table(
        "engagement_signals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("visual_attention", sa.Float(), nullable=False),
        sa.Column("participation", sa.Float(), nullable=False),
        sa.Column("quiz_accuracy", sa.Float(), nullable=False),
        sa.Column("attendance_consistency", sa.Float(), nullable=False),
        sa.Column("engagement_score", sa.Float(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("raw", sa.JSON(), nullable=True),
    )
    op.create_index("ix_engagement_signals_session_id", "engagement_signals", ["session_id"])
    op.create_index("ix_engagement_signals_student_id", "engagement_signals", ["student_id"])
    op.create_index("ix_engagement_session_student_time", "engagement_signals", ["session_id", "student_id", "timestamp"])

    op.create_table(
        "session_summaries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("average_engagement", sa.Float(), nullable=False),
        sa.Column("distracted_percent", sa.Float(), nullable=False),
        sa.Column("trend", sa.JSON(), nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint("uq_session_summary", "session_summaries", ["session_id"])


def downgrade() -> None:
    op.drop_constraint("uq_session_summary", "session_summaries", type_="unique")
    op.drop_table("session_summaries")
    op.drop_index("ix_engagement_session_student_time", table_name="engagement_signals")
    op.drop_index("ix_engagement_signals_student_id", table_name="engagement_signals")
    op.drop_index("ix_engagement_signals_session_id", table_name="engagement_signals")
    op.drop_table("engagement_signals")
    op.drop_index("ix_session_participant_session_student", table_name="session_participants")
    op.drop_constraint("uq_session_student", "session_participants", type_="unique")
    op.drop_index("ix_session_participants_student_id", table_name="session_participants")
    op.drop_index("ix_session_participants_session_id", table_name="session_participants")
    op.drop_table("session_participants")
    op.drop_index("ix_sessions_class_status", table_name="class_sessions")
    op.drop_index("ix_sessions_teacher_status", table_name="class_sessions")
    op.drop_index("ix_class_sessions_status", table_name="class_sessions")
    op.drop_index("ix_class_sessions_teacher_id", table_name="class_sessions")
    op.drop_index("ix_class_sessions_class_id", table_name="class_sessions")
    op.drop_index("ix_class_sessions_session_code", table_name="class_sessions")
    op.drop_table("class_sessions")

"""Analytics service for admin dashboard."""

from typing import Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import ClassSession, SessionSummary, SessionStatus
from app.models.classroom import Classroom


async def get_admin_analytics(db: AsyncSession) -> Dict[str, Any]:
    # Course comparison
    course_rows = await db.execute(
        select(
            ClassSession.course,
            func.avg(SessionSummary.average_engagement).label("avg_engagement"),
            func.count(SessionSummary.id).label("sessions"),
        )
        .join(SessionSummary, SessionSummary.session_id == ClassSession.id)
        .where(ClassSession.status == SessionStatus.ENDED.value)
        .group_by(ClassSession.course)
    )

    course_comparison = [
        {
            "course": row.course,
            "average_engagement": float(row.avg_engagement or 0),
            "sessions": int(row.sessions or 0),
        }
        for row in course_rows.all()
    ]

    # Teacher effectiveness
    teacher_rows = await db.execute(
        select(
            ClassSession.teacher_id,
            func.avg(SessionSummary.average_engagement).label("avg_engagement"),
            func.count(SessionSummary.id).label("sessions"),
        )
        .join(SessionSummary, SessionSummary.session_id == ClassSession.id)
        .where(ClassSession.status == SessionStatus.ENDED.value)
        .group_by(ClassSession.teacher_id)
    )
    teacher_effectiveness = [
        {
            "teacher_id": int(row.teacher_id or 0),
            "average_engagement": float(row.avg_engagement or 0),
            "sessions": int(row.sessions or 0),
        }
        for row in teacher_rows.all()
    ]

    # Department trends
    dept_rows = await db.execute(
        select(
            Classroom.department,
            func.avg(SessionSummary.average_engagement).label("avg_engagement"),
            func.count(SessionSummary.id).label("sessions"),
        )
        .join(ClassSession, ClassSession.class_id == Classroom.id)
        .join(SessionSummary, SessionSummary.session_id == ClassSession.id)
        .where(ClassSession.status == SessionStatus.ENDED.value)
        .group_by(Classroom.department)
    )
    department_trends = [
        {
            "department": row.department or "Unknown",
            "average_engagement": float(row.avg_engagement or 0),
            "sessions": int(row.sessions or 0),
        }
        for row in dept_rows.all()
    ]

    # Dropout risk trend: use distracted_percent over time
    trend_rows = await db.execute(
        select(SessionSummary.computed_at, SessionSummary.distracted_percent)
        .order_by(SessionSummary.computed_at.asc())
        .limit(50)
    )
    dropout_risk_trend = [
        {
            "timestamp": row.computed_at.isoformat(),
            "distracted_percent": float(row.distracted_percent),
        }
        for row in trend_rows.all()
    ]

    return {
        "course_comparison": course_comparison,
        "teacher_effectiveness": teacher_effectiveness,
        "department_trends": department_trends,
        "dropout_risk_trend": dropout_risk_trend,
    }

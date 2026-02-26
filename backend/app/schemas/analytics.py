"""Analytics schemas for module 4."""

from typing import List, Dict, Any
from pydantic import BaseModel


class CourseComparison(BaseModel):
    course: str
    average_engagement: float
    sessions: int


class TeacherEffectiveness(BaseModel):
    teacher_id: int
    average_engagement: float
    sessions: int


class DepartmentTrend(BaseModel):
    department: str
    average_engagement: float
    sessions: int


class AdminAnalyticsResponse(BaseModel):
    course_comparison: List[CourseComparison]
    teacher_effectiveness: List[TeacherEffectiveness]
    department_trends: List[DepartmentTrend]
    dropout_risk_trend: List[Dict[str, Any]]

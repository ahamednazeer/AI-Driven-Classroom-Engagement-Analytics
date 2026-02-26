"""Pydantic schemas for session and engagement management."""

from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field, ConfigDict


class SessionCreate(BaseModel):
    class_id: Optional[int] = None
    course: str = Field(..., min_length=2, max_length=120)
    subject: str = Field(..., min_length=2, max_length=120)
    topic: str = Field(..., min_length=2, max_length=200)
    scheduled_start: datetime
    scheduled_end: datetime
    tracking_enabled: bool = True


class SessionResponse(BaseModel):
    id: int
    session_code: str
    class_id: Optional[int] = None
    teacher_id: Optional[int] = None
    course: str
    subject: str
    topic: str
    scheduled_start: datetime
    scheduled_end: datetime
    tracking_enabled: bool
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionListResponse(BaseModel):
    sessions: List[SessionResponse]
    total: int
    page: int
    per_page: int


class SessionStartResponse(BaseModel):
    id: int
    status: str
    started_at: datetime


class SessionEndResponse(BaseModel):
    id: int
    status: str
    ended_at: datetime


class SessionJoinRequest(BaseModel):
    auth_type: Optional[str] = Field(None, description="password or face")
    device_info: Optional[Dict[str, Any]] = None


class ParticipantResponse(BaseModel):
    id: int
    session_id: int
    student_id: Optional[int] = None
    joined_at: datetime
    attendance_mark: bool
    auth_type: Optional[str] = None
    device_info: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class EngagementSignalCreate(BaseModel):
    student_id: Optional[int] = None
    visual_attention: float = Field(..., ge=0, le=1)
    participation: float = Field(..., ge=0, le=1)
    quiz_accuracy: float = Field(..., ge=0, le=1)
    attendance_consistency: float = Field(..., ge=0, le=1)
    raw: Optional[Dict[str, Any]] = None


class BehavioralSignalCreate(BaseModel):
    student_id: Optional[int] = None
    head_pose_yaw: Optional[float] = Field(None, ge=-90, le=90)
    head_pose_pitch: Optional[float] = Field(None, ge=-90, le=90)
    posture_score: Optional[float] = Field(None, ge=0, le=1)
    gaze_score: Optional[float] = Field(None, ge=0, le=1)
    movement_intensity: Optional[float] = Field(None, ge=0, le=1)
    participation_event: bool = False
    quiz_correct: Optional[bool] = None
    attendance_consistency: Optional[float] = Field(1.0, ge=0, le=1)
    seat_row: Optional[int] = Field(None, ge=1, le=40)
    raw: Optional[Dict[str, Any]] = None


class EngagementSignalResponse(BaseModel):
    id: int
    session_id: int
    student_id: Optional[int] = None
    timestamp: datetime
    visual_attention: float
    participation: float
    quiz_accuracy: float
    attendance_consistency: float
    engagement_score: float
    category: str

    model_config = ConfigDict(from_attributes=True)


class EngagementStudentSnapshot(BaseModel):
    participant_key: str
    student_id: Optional[int] = None
    row_index: Optional[int] = None
    engagement_score: float
    visual_attention: float
    face_visible: Optional[bool] = None
    face_count: Optional[int] = None
    vision_confidence: Optional[float] = None
    participation: float
    quiz_accuracy: float
    attendance_consistency: float
    category: str
    last_updated: datetime


class EngagementClassSnapshot(BaseModel):
    average_engagement: float
    distracted_percent: float
    total_signals: int
    total_active_participants: int
    trend: List[Dict[str, Any]]


class EngagementSnapshotResponse(BaseModel):
    students: List[EngagementStudentSnapshot]
    class_stats: EngagementClassSnapshot


class EngagementRowHeatmapItem(BaseModel):
    row_index: int
    average_attention: float
    average_engagement: float
    participants: int
    risk_level: str


class EngagementSessionHeatmapItem(BaseModel):
    timestamp: datetime
    average_engagement: float
    distracted_percent: float
    signals: int


class EngagementPrediction(BaseModel):
    current_average: float
    predicted_average_10m: float
    predicted_average_20m: float
    drop_probability: float
    estimated_drop_in_minutes: Optional[int] = None
    risk_level: str


class EngagementInsightContext(BaseModel):
    topic_difficulty: str
    time_of_day: str
    elapsed_minutes: int
    session_status: str


class AdaptiveSuggestion(BaseModel):
    title: str
    reason: str
    recommendation: str
    priority: str


class EngagementInsightsResponse(BaseModel):
    students: List[EngagementStudentSnapshot]
    class_stats: EngagementClassSnapshot
    row_heatmap: List[EngagementRowHeatmapItem]
    session_heatmap: List[EngagementSessionHeatmapItem]
    prediction: EngagementPrediction
    context: EngagementInsightContext
    adaptive_suggestions: List[AdaptiveSuggestion]
    privacy: Dict[str, Any]


class SessionSummaryResponse(BaseModel):
    session_id: int
    average_engagement: float
    distracted_percent: float
    trend: List[Dict[str, Any]]
    computed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DemoSignalSeedResponse(BaseModel):
    created: int


class SessionQuizCreate(BaseModel):
    question: str = Field(..., min_length=5, max_length=500)
    options: List[str] = Field(..., min_length=2, max_length=6)
    correct_option_index: int = Field(..., ge=0)
    duration_seconds: int = Field(60, ge=15, le=3600)


class SessionQuizResponsePayload(BaseModel):
    selected_option_index: int = Field(..., ge=0)


class SessionQuizItem(BaseModel):
    id: int
    session_id: int
    teacher_id: Optional[int] = None
    question: str
    options: List[str]
    correct_option_index: Optional[int] = None
    duration_seconds: int = 60
    expires_at: Optional[datetime] = None
    remaining_seconds: Optional[int] = None
    is_active: bool
    created_at: datetime
    closed_at: Optional[datetime] = None
    total_responses: int = 0
    correct_responses: int = 0
    already_answered: Optional[bool] = None


class SessionQuizListResponse(BaseModel):
    quizzes: List[SessionQuizItem]


class SessionQuizAnswerResponse(BaseModel):
    quiz_id: int
    selected_option_index: int
    is_correct: bool
    correct_option_index: int
    answered_at: datetime


class StudentQuizStats(BaseModel):
    attempted: int
    correct: int
    accuracy: float

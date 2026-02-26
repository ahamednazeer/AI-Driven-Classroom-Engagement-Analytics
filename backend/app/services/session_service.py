"""Session service: creation, lifecycle, participants, and engagement analytics."""

import random
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple, Dict, Any

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.session import (
    ClassSession,
    SessionStatus,
    SessionParticipant,
    EngagementSignal,
    SessionSummary,
    SessionQuiz,
    SessionQuizResponse,
)
from app.models.classroom import Classroom
from app.models.user import User, UserRole
from app.config import settings

_ANONYMIZED_RAW_BLOCKLIST = {
    "image",
    "image_bytes",
    "frame",
    "face",
    "face_image",
    "face_embedding",
    "embedding",
    "username",
    "email",
    "full_name",
    "student_name",
}


def _generate_session_code() -> str:
    return uuid.uuid4().hex[:10].upper()


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _round2(value: float) -> float:
    return round(float(value), 2)


def _to_utc(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _minute_bucket(dt: datetime) -> datetime:
    dt_utc = _to_utc(dt)
    return dt_utc.replace(second=0, microsecond=0)


def _window_bucket(dt: datetime, anchor: datetime, window_minutes: int = 5) -> datetime:
    anchor_utc = _minute_bucket(anchor)
    dt_utc = _to_utc(dt)
    delta_minutes = int((dt_utc - anchor_utc).total_seconds() // 60)
    window_index = max(delta_minutes // max(window_minutes, 1), 0)
    return anchor_utc + timedelta(minutes=window_index * window_minutes)


def _risk_level_from_score(score: float) -> str:
    if score >= 75:
        return "LOW"
    if score >= 55:
        return "MEDIUM"
    return "HIGH"


def _sanitize_signal_raw(raw: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    sanitized: Dict[str, Any] = {}
    for key, value in raw.items():
        key_lower = str(key).strip().lower()
        if key_lower in _ANONYMIZED_RAW_BLOCKLIST:
            continue
        if "image" in key_lower or "photo" in key_lower or "embed" in key_lower:
            continue
        sanitized[key] = value
    return sanitized or None


def _participant_key(signal: EngagementSignal) -> str:
    if signal.student_id is not None:
        return f"student:{signal.student_id}"
    raw = signal.raw or {}
    for key in ("participant_key", "anon_id", "track_id", "seat_label"):
        value = raw.get(key)
        if value is not None and str(value).strip():
            return f"anonymous:{value}"
    return f"anonymous:{signal.id}"


def _extract_row_index(raw: Optional[Dict[str, Any]]) -> Optional[int]:
    if not raw:
        return None
    for key in ("seat_row", "row_index", "row", "bench_row"):
        value = raw.get(key)
        if value is None:
            continue
        try:
            row_value = int(value)
        except (TypeError, ValueError):
            continue
        if row_value > 0:
            return row_value
    return None


def _raw_int(raw: Optional[Dict[str, Any]], key: str) -> Optional[int]:
    if not raw:
        return None
    value = raw.get(key)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _raw_float(raw: Optional[Dict[str, Any]], key: str) -> Optional[float]:
    if not raw:
        return None
    value = raw.get(key)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_face_visibility(raw: Optional[Dict[str, Any]], *, visual_attention: float) -> Dict[str, Any]:
    if not raw:
        return {"face_visible": None, "face_count": None, "vision_confidence": None}

    source = str(raw.get("source") or "").strip().lower()
    if not source.startswith("vision"):
        return {"face_visible": None, "face_count": None, "vision_confidence": None}

    face_count = _raw_int(raw, "face_count")
    confidence_raw = _raw_float(raw, "confidence")
    vision_confidence = (
        _round2(_clamp_unit(confidence_raw) * 100.0) if confidence_raw is not None else None
    )

    if face_count is not None:
        face_visible = face_count > 0
    elif confidence_raw is not None:
        face_visible = confidence_raw > 0.05
    else:
        face_visible = visual_attention > 0.0

    return {
        "face_visible": face_visible,
        "face_count": face_count,
        "vision_confidence": vision_confidence,
    }


def _time_of_day_label(local_hour: int) -> str:
    if 5 <= local_hour < 12:
        return "Morning"
    if 12 <= local_hour < 17:
        return "Afternoon"
    if 17 <= local_hour < 21:
        return "Evening"
    return "Night"


def _difficulty_label(topic_difficulty: Optional[str]) -> str:
    if not topic_difficulty:
        return "MEDIUM"
    normalized = topic_difficulty.strip().upper()
    if normalized in {"LOW", "EASY"}:
        return "LOW"
    if normalized in {"HIGH", "HARD"}:
        return "HIGH"
    return "MEDIUM"


def _normalize_quiz_options(options: List[str]) -> List[str]:
    normalized = [str(option).strip() for option in options if str(option).strip()]
    if len(normalized) < 2 or len(normalized) > 6:
        raise ValueError("Quiz must contain between 2 and 6 options")
    return normalized


def _normalize_quiz_duration(duration_seconds: Optional[int]) -> int:
    try:
        duration = int(duration_seconds or 60)
    except (TypeError, ValueError) as exc:
        raise ValueError("Quiz duration must be an integer number of seconds") from exc
    if duration < 15 or duration > 3600:
        raise ValueError("Quiz duration must be between 15 and 3600 seconds")
    return duration


def _quiz_remaining_seconds(quiz: SessionQuiz, now: datetime) -> Optional[int]:
    if not quiz.expires_at:
        return None
    remaining = int((_to_utc(quiz.expires_at) - now).total_seconds())
    return max(remaining, 0)


def _expire_quiz_if_needed(quiz: SessionQuiz, now: datetime) -> bool:
    if not quiz.is_active:
        return False
    if not quiz.expires_at:
        return False
    if _to_utc(quiz.expires_at) > now:
        return False
    quiz.is_active = False
    if quiz.closed_at is None:
        quiz.closed_at = _to_utc(quiz.expires_at)
    return True


def compute_engagement_score(
    visual_attention: float,
    participation: float,
    quiz_accuracy: float,
    attendance_consistency: float,
) -> tuple[float, str]:
    score = (
        _clamp_unit(visual_attention) * 0.4
        + _clamp_unit(participation) * 0.3
        + _clamp_unit(quiz_accuracy) * 0.2
        + _clamp_unit(attendance_consistency) * 0.1
    ) * 100.0

    if score > 80:
        category = "High"
    elif score >= 60:
        category = "Medium"
    elif score >= 40:
        category = "Low"
    else:
        category = "Disengaged"

    return _round2(score), category


def derive_metrics_from_behavioral_features(
    *,
    head_pose_yaw: Optional[float] = None,
    head_pose_pitch: Optional[float] = None,
    posture_score: Optional[float] = None,
    gaze_score: Optional[float] = None,
    movement_intensity: Optional[float] = None,
    participation_event: Optional[bool] = None,
    quiz_correct: Optional[bool] = None,
    attendance_consistency: Optional[float] = None,
) -> tuple[float, float, float, float]:
    """Convert non-identifying behavioral features into normalized signal components."""
    yaw = abs(float(head_pose_yaw or 0.0))
    pitch = abs(float(head_pose_pitch or 0.0))
    posture = _clamp_unit(posture_score if posture_score is not None else 0.7)
    gaze = _clamp_unit(gaze_score if gaze_score is not None else 0.65)
    movement = _clamp_unit(movement_intensity if movement_intensity is not None else 0.35)

    yaw_penalty = min(yaw / 55.0, 1.0) * 0.28
    pitch_penalty = min(pitch / 45.0, 1.0) * 0.2
    movement_penalty = max(0.0, movement - 0.7) * 0.35

    visual_attention = _clamp_unit(
        0.58
        + (gaze - 0.5) * 0.45
        + (posture - 0.5) * 0.25
        - yaw_penalty
        - pitch_penalty
        - movement_penalty
    )
    participation = _clamp_unit(
        0.28
        + (0.45 if participation_event else 0.0)
        + min(movement, 0.6) * 0.35
    )
    if quiz_correct is None:
        quiz_accuracy = 0.55
    else:
        quiz_accuracy = 1.0 if quiz_correct else 0.15
    attendance = _clamp_unit(attendance_consistency if attendance_consistency is not None else 1.0)
    return visual_attention, participation, quiz_accuracy, attendance


async def create_session(
    db: AsyncSession,
    teacher_id: int,
    class_id: Optional[int],
    course: str,
    subject: str,
    topic: str,
    scheduled_start: datetime,
    scheduled_end: datetime,
    tracking_enabled: bool,
) -> ClassSession:
    if class_id:
        classroom = await db.execute(select(Classroom).where(Classroom.id == class_id))
        if not classroom.scalar_one_or_none():
            raise ValueError("Class not found")

    session = ClassSession(
        session_code=_generate_session_code(),
        class_id=class_id,
        teacher_id=teacher_id,
        course=course,
        subject=subject,
        topic=topic,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        tracking_enabled=tracking_enabled,
        status=SessionStatus.SCHEDULED.value,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def get_session_by_id(db: AsyncSession, session_id: int) -> Optional[ClassSession]:
    result = await db.execute(
        select(ClassSession)
        .options(selectinload(ClassSession.participants), selectinload(ClassSession.summary))
        .where(ClassSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def list_sessions(
    db: AsyncSession,
    role: UserRole,
    user_id: int,
    class_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
) -> Tuple[List[ClassSession], int]:
    query = select(ClassSession)
    count_query = select(func.count(ClassSession.id))

    filters = []
    if role == UserRole.TEACHER:
        filters.append(ClassSession.teacher_id == user_id)
    elif role == UserRole.STUDENT:
        if class_id:
            filters.append(ClassSession.class_id == class_id)
        filters.append(ClassSession.status == SessionStatus.LIVE.value)
    elif role != UserRole.ADMIN:
        return [], 0

    if class_id and role != UserRole.STUDENT:
        filters.append(ClassSession.class_id == class_id)
    if status:
        try:
            status_enum = SessionStatus(status)
        except ValueError:
            return [], 0
        filters.append(ClassSession.status == status_enum.value)

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(ClassSession.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    sessions = result.scalars().all()
    return list(sessions), total


async def start_session(db: AsyncSession, session_id: int, teacher_id: int) -> ClassSession:
    session = await get_session_by_id(db, session_id)
    if not session:
        raise ValueError("Session not found")
    if session.teacher_id != teacher_id:
        raise ValueError("Not authorized")
    session.status = SessionStatus.LIVE.value
    session.started_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(session)
    return session


async def end_session(db: AsyncSession, session_id: int, teacher_id: int) -> ClassSession:
    session = await get_session_by_id(db, session_id)
    if not session:
        raise ValueError("Session not found")
    if session.teacher_id != teacher_id:
        raise ValueError("Not authorized")
    session.status = SessionStatus.ENDED.value
    session.ended_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(session)
    await compute_and_store_summary(db, session_id)
    return session


async def join_session(
    db: AsyncSession,
    session_id: int,
    student_id: int,
    auth_type: Optional[str],
    device_info: Optional[Dict[str, Any]],
) -> SessionParticipant:
    session = await get_session_by_id(db, session_id)
    if not session:
        raise ValueError("Session not found")
    if session.status != SessionStatus.LIVE.value:
        raise ValueError("Session is not live")

    student = await db.get(User, student_id)
    if not student:
        raise ValueError("Student not found")
    if session.class_id and student.classroom_id != session.class_id:
        raise ValueError("Student is not assigned to this class")

    existing = await db.execute(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.student_id == student_id,
        )
    )
    existing_participant = existing.scalar_one_or_none()
    if existing_participant:
        return existing_participant

    participant = SessionParticipant(
        session_id=session_id,
        student_id=student_id,
        joined_at=datetime.now(timezone.utc),
        attendance_mark=True,
        auth_type=auth_type,
        device_info=device_info,
    )
    db.add(participant)
    await db.flush()
    await db.refresh(participant)
    return participant


async def list_participants(db: AsyncSession, session_id: int) -> List[SessionParticipant]:
    result = await db.execute(
        select(SessionParticipant).where(SessionParticipant.session_id == session_id)
    )
    return list(result.scalars().all())


async def create_session_quiz(
    db: AsyncSession,
    *,
    session_id: int,
    teacher_id: int,
    question: str,
    options: List[str],
    correct_option_index: int,
    duration_seconds: int = 60,
) -> SessionQuiz:
    session = await db.get(ClassSession, session_id)
    if not session:
        raise ValueError("Session not found")
    if session.teacher_id != teacher_id:
        raise ValueError("Not authorized")
    if session.status != SessionStatus.LIVE.value:
        raise ValueError("Session must be live to publish quiz checkpoints")

    normalized_options = _normalize_quiz_options(options)
    if correct_option_index < 0 or correct_option_index >= len(normalized_options):
        raise ValueError("Correct option index is out of range")
    normalized_duration_seconds = _normalize_quiz_duration(duration_seconds)
    now = datetime.now(timezone.utc)

    quiz = SessionQuiz(
        session_id=session_id,
        teacher_id=teacher_id,
        question=question.strip(),
        options=normalized_options,
        correct_option_index=correct_option_index,
        duration_seconds=normalized_duration_seconds,
        expires_at=now + timedelta(seconds=normalized_duration_seconds),
        is_active=True,
        created_at=now,
    )
    db.add(quiz)
    await db.flush()
    await db.refresh(quiz)
    return quiz


async def close_session_quiz(
    db: AsyncSession,
    *,
    session_id: int,
    quiz_id: int,
    teacher_id: int,
) -> SessionQuiz:
    quiz = await db.get(SessionQuiz, quiz_id)
    if not quiz or quiz.session_id != session_id:
        raise ValueError("Quiz not found")

    session = await db.get(ClassSession, session_id)
    if not session:
        raise ValueError("Session not found")
    if session.teacher_id != teacher_id:
        raise ValueError("Not authorized")

    expired = _expire_quiz_if_needed(quiz, datetime.now(timezone.utc))

    if quiz.is_active:
        quiz.is_active = False
        quiz.closed_at = datetime.now(timezone.utc)
    if expired or not quiz.is_active:
        await db.flush()
    await db.refresh(quiz)
    return quiz


async def list_session_quizzes(
    db: AsyncSession,
    *,
    session_id: int,
    include_inactive: bool = True,
    include_correct_option: bool = True,
    student_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    session = await db.get(ClassSession, session_id)
    if not session:
        raise ValueError("Session not found")

    query = select(SessionQuiz).where(SessionQuiz.session_id == session_id)
    if not include_inactive:
        query = query.where(SessionQuiz.is_active.is_(True))
    query = query.order_by(SessionQuiz.created_at.desc(), SessionQuiz.id.desc())

    result = await db.execute(query)
    quizzes = list(result.scalars().all())
    if not quizzes:
        return []

    now = datetime.now(timezone.utc)
    expired_any = False
    for quiz in quizzes:
        if _expire_quiz_if_needed(quiz, now):
            expired_any = True
    if expired_any:
        await db.flush()

    if not include_inactive:
        quizzes = [quiz for quiz in quizzes if quiz.is_active]
        if not quizzes:
            return []

    quiz_ids = [quiz.id for quiz in quizzes]
    stats_result = await db.execute(
        select(
            SessionQuizResponse.quiz_id,
            func.count(SessionQuizResponse.id).label("total_responses"),
            func.sum(case((SessionQuizResponse.is_correct.is_(True), 1), else_=0)).label("correct_responses"),
        )
        .where(SessionQuizResponse.quiz_id.in_(quiz_ids))
        .group_by(SessionQuizResponse.quiz_id)
    )
    stats_lookup: Dict[int, Dict[str, int]] = {}
    for row in stats_result.all():
        stats_lookup[int(row.quiz_id)] = {
            "total_responses": int(row.total_responses or 0),
            "correct_responses": int(row.correct_responses or 0),
        }

    answered_lookup: Dict[int, bool] = {}
    if student_id is not None:
        answered_result = await db.execute(
            select(SessionQuizResponse.quiz_id)
            .where(
                SessionQuizResponse.quiz_id.in_(quiz_ids),
                SessionQuizResponse.student_id == student_id,
            )
        )
        answered_lookup = {int(row.quiz_id): True for row in answered_result.all()}

    payload: List[Dict[str, Any]] = []
    for quiz in quizzes:
        stats = stats_lookup.get(quiz.id, {"total_responses": 0, "correct_responses": 0})
        item = {
            "id": quiz.id,
            "session_id": quiz.session_id,
            "teacher_id": quiz.teacher_id,
            "question": quiz.question,
            "options": list(quiz.options or []),
            "correct_option_index": quiz.correct_option_index if include_correct_option else None,
            "duration_seconds": int(quiz.duration_seconds or 60),
            "expires_at": quiz.expires_at,
            "remaining_seconds": _quiz_remaining_seconds(quiz, now),
            "is_active": quiz.is_active,
            "created_at": quiz.created_at,
            "closed_at": quiz.closed_at,
            "total_responses": stats["total_responses"],
            "correct_responses": stats["correct_responses"],
        }
        if student_id is not None:
            item["already_answered"] = answered_lookup.get(quiz.id, False)
        payload.append(item)
    return payload


async def get_active_quizzes_for_student(
    db: AsyncSession,
    *,
    session_id: int,
    student_id: int,
) -> List[Dict[str, Any]]:
    quizzes = await list_session_quizzes(
        db,
        session_id=session_id,
        include_inactive=False,
        include_correct_option=False,
        student_id=student_id,
    )
    return [quiz for quiz in quizzes if not quiz.get("already_answered")]


async def submit_quiz_response(
    db: AsyncSession,
    *,
    session_id: int,
    quiz_id: int,
    student_id: int,
    selected_option_index: int,
) -> Dict[str, Any]:
    session = await db.get(ClassSession, session_id)
    if not session:
        raise ValueError("Session not found")
    if session.status != SessionStatus.LIVE.value:
        raise ValueError("Session is not live")

    quiz = await db.get(SessionQuiz, quiz_id)
    if not quiz or quiz.session_id != session_id:
        raise ValueError("Quiz not found")

    now = datetime.now(timezone.utc)
    if _expire_quiz_if_needed(quiz, now):
        await db.flush()
    if not quiz.is_active:
        raise ValueError("Quiz is closed or time is over")

    options = list(quiz.options or [])
    if selected_option_index < 0 or selected_option_index >= len(options):
        raise ValueError("Selected option index is out of range")

    participant = await db.execute(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.student_id == student_id,
        )
    )
    if not participant.scalar_one_or_none():
        raise ValueError("Join session before answering quizzes")

    existing = await db.execute(
        select(SessionQuizResponse).where(
            SessionQuizResponse.quiz_id == quiz_id,
            SessionQuizResponse.student_id == student_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Quiz already answered")

    is_correct = selected_option_index == quiz.correct_option_index
    response = SessionQuizResponse(
        quiz_id=quiz_id,
        session_id=session_id,
        student_id=student_id,
        selected_option_index=selected_option_index,
        is_correct=is_correct,
        answered_at=datetime.now(timezone.utc),
    )
    db.add(response)
    await db.flush()

    return {
        "quiz_id": quiz_id,
        "selected_option_index": selected_option_index,
        "is_correct": is_correct,
        "correct_option_index": quiz.correct_option_index,
        "answered_at": response.answered_at,
    }


async def get_student_quiz_stats(
    db: AsyncSession,
    *,
    session_id: int,
    student_id: int,
) -> Dict[str, Any]:
    stats_result = await db.execute(
        select(
            func.count(SessionQuizResponse.id).label("attempted"),
            func.sum(case((SessionQuizResponse.is_correct.is_(True), 1), else_=0)).label("correct"),
        )
        .where(
            SessionQuizResponse.session_id == session_id,
            SessionQuizResponse.student_id == student_id,
        )
    )
    row = stats_result.one()
    attempted = int(row.attempted or 0)
    correct = int(row.correct or 0)
    accuracy = (correct / attempted) if attempted > 0 else 0.0
    return {
        "attempted": attempted,
        "correct": correct,
        "accuracy": _round2(accuracy),
    }


async def get_student_quiz_accuracy_for_signal(
    db: AsyncSession,
    *,
    session_id: int,
    student_id: int,
    fallback: float = 0.55,
) -> float:
    stats = await get_student_quiz_stats(db, session_id=session_id, student_id=student_id)
    if stats["attempted"] <= 0:
        return _clamp_unit(fallback)
    return _clamp_unit(stats["accuracy"])


async def record_signal(
    db: AsyncSession,
    session_id: int,
    student_id: Optional[int],
    visual_attention: float,
    participation: float,
    quiz_accuracy: float,
    attendance_consistency: float,
    raw: Optional[Dict[str, Any]],
) -> EngagementSignal:
    result = await db.execute(
        select(ClassSession).where(ClassSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError("Session not found")
    if session.status != SessionStatus.LIVE.value:
        raise ValueError("Session is not live")
    if not session.tracking_enabled:
        raise ValueError("Engagement tracking is disabled for this session")

    min_interval = max(settings.ENGAGEMENT_SIGNAL_MIN_INTERVAL_SECONDS, 0)
    if min_interval and student_id is not None:
        last_result = await db.execute(
            select(func.max(EngagementSignal.timestamp)).where(
                EngagementSignal.session_id == session_id,
                EngagementSignal.student_id == student_id,
            )
        )
        last_ts = last_result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if last_ts and (now - last_ts).total_seconds() < min_interval:
            raise ValueError("Engagement signal too frequent, please wait a moment")

    score, category = compute_engagement_score(
        visual_attention, participation, quiz_accuracy, attendance_consistency
    )
    signal = EngagementSignal(
        session_id=session_id,
        student_id=student_id,
        visual_attention=_clamp_unit(visual_attention),
        participation=_clamp_unit(participation),
        quiz_accuracy=_clamp_unit(quiz_accuracy),
        attendance_consistency=_clamp_unit(attendance_consistency),
        engagement_score=score,
        category=category,
        raw=_sanitize_signal_raw(raw),
    )
    db.add(signal)
    await db.flush()
    await db.refresh(signal)
    return signal


async def get_session_signals(
    db: AsyncSession,
    session_id: int,
    limit: Optional[int] = None,
) -> List[EngagementSignal]:
    query = (
        select(EngagementSignal)
        .where(EngagementSignal.session_id == session_id)
        .order_by(EngagementSignal.timestamp.asc(), EngagementSignal.id.asc())
    )
    if limit:
        query = query.limit(max(limit, 1))
    result = await db.execute(query)
    return list(result.scalars().all())


def _build_snapshot_payload(signals: List[EngagementSignal]) -> Dict[str, Any]:
    latest_by_key: Dict[str, EngagementSignal] = {}
    for signal in signals:
        key = _participant_key(signal)
        previous = latest_by_key.get(key)
        if (
            not previous
            or _to_utc(signal.timestamp) > _to_utc(previous.timestamp)
            or (
                _to_utc(signal.timestamp) == _to_utc(previous.timestamp)
                and signal.id > previous.id
            )
        ):
            latest_by_key[key] = signal

    participant_keys = sorted(latest_by_key.keys())
    row_lookup: Dict[str, int] = {}
    for index, key in enumerate(participant_keys):
        signal = latest_by_key[key]
        explicit_row = _extract_row_index(signal.raw if isinstance(signal.raw, dict) else None)
        row_lookup[key] = explicit_row or (index // 6) + 1

    students = []
    latest_list = list(latest_by_key.items())
    latest_list.sort(key=lambda item: (row_lookup.get(item[0], 1), item[0]))
    for key, signal in latest_list:
        raw_payload = signal.raw if isinstance(signal.raw, dict) else None
        face_meta = _extract_face_visibility(raw_payload, visual_attention=signal.visual_attention)
        students.append(
            {
                "participant_key": key,
                "student_id": signal.student_id,
                "row_index": row_lookup.get(key),
                "engagement_score": _round2(signal.engagement_score),
                "visual_attention": _round2(signal.visual_attention * 100.0),
                "face_visible": face_meta["face_visible"],
                "face_count": face_meta["face_count"],
                "vision_confidence": face_meta["vision_confidence"],
                "participation": _round2(signal.participation * 100.0),
                "quiz_accuracy": _round2(signal.quiz_accuracy * 100.0),
                "attendance_consistency": _round2(signal.attendance_consistency * 100.0),
                "category": signal.category,
                "last_updated": signal.timestamp,
            }
        )

    latest_scores = [signal.engagement_score for signal in latest_by_key.values()]
    average_engagement = sum(latest_scores) / max(len(latest_scores), 1)
    distracted_count = len([score for score in latest_scores if score < 40])
    distracted_percent = (distracted_count / max(len(latest_scores), 1)) * 100.0

    trend_map: Dict[datetime, List[float]] = defaultdict(list)
    for signal in signals:
        trend_map[_minute_bucket(signal.timestamp)].append(signal.engagement_score)

    trend = [
        {
            "timestamp": minute.isoformat(),
            "avg": _round2(sum(scores) / len(scores)),
        }
        for minute, scores in sorted(trend_map.items(), key=lambda item: item[0])
    ]

    return {
        "students": students,
        "class_stats": {
            "average_engagement": _round2(average_engagement),
            "distracted_percent": _round2(distracted_percent),
            "total_signals": len(signals),
            "total_active_participants": len(latest_by_key),
            "trend": trend,
        },
        "_latest_by_key": latest_by_key,
        "_row_lookup": row_lookup,
    }


def _build_row_heatmap(
    latest_by_key: Dict[str, EngagementSignal],
    row_lookup: Dict[str, int],
) -> List[Dict[str, Any]]:
    grouped: Dict[int, List[EngagementSignal]] = defaultdict(list)
    for key, signal in latest_by_key.items():
        grouped[row_lookup.get(key, 1)].append(signal)

    heatmap = []
    for row_index in sorted(grouped.keys()):
        row_signals = grouped[row_index]
        avg_attention = sum(item.visual_attention for item in row_signals) / len(row_signals)
        avg_engagement = sum(item.engagement_score for item in row_signals) / len(row_signals)
        heatmap.append(
            {
                "row_index": row_index,
                "average_attention": _round2(avg_attention * 100.0),
                "average_engagement": _round2(avg_engagement),
                "participants": len(row_signals),
                "risk_level": _risk_level_from_score(avg_engagement),
            }
        )
    return heatmap


def _build_session_heatmap(
    signals: List[EngagementSignal],
    *,
    anchor: datetime,
) -> List[Dict[str, Any]]:
    grouped: Dict[datetime, List[EngagementSignal]] = defaultdict(list)
    for signal in signals:
        grouped[_window_bucket(signal.timestamp, anchor, window_minutes=5)].append(signal)

    session_heatmap = []
    for bucket_start in sorted(grouped.keys()):
        points = grouped[bucket_start]
        avg_engagement = sum(item.engagement_score for item in points) / len(points)
        distracted = len([item for item in points if item.engagement_score < 40])
        session_heatmap.append(
            {
                "timestamp": bucket_start.isoformat(),
                "average_engagement": _round2(avg_engagement),
                "distracted_percent": _round2((distracted / len(points)) * 100.0),
                "signals": len(points),
            }
        )
    return session_heatmap


def _predict_attention_drop(
    trend: List[Dict[str, Any]],
    distracted_percent: float,
) -> Dict[str, Any]:
    if not trend:
        return {
            "current_average": 0.0,
            "predicted_average_10m": 0.0,
            "predicted_average_20m": 0.0,
            "drop_probability": 0.0,
            "estimated_drop_in_minutes": None,
            "risk_level": "LOW",
        }

    values = [float(point.get("avg", 0.0)) for point in trend]
    current_average = values[-1]

    if len(values) == 1:
        slope = 0.0
    else:
        x_vals = list(range(len(values)))
        x_mean = sum(x_vals) / len(x_vals)
        y_mean = sum(values) / len(values)
        numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, values))
        denominator = sum((x - x_mean) ** 2 for x in x_vals) or 1.0
        slope = numerator / denominator

    predicted_10m = max(min(current_average + (slope * 2), 100.0), 0.0)
    predicted_20m = max(min(current_average + (slope * 4), 100.0), 0.0)

    slope_component = max(min((-slope) / 4.0, 1.0), 0.0)
    distracted_component = max(min(distracted_percent / 100.0, 1.0), 0.0)
    low_attention_component = max(min((60.0 - current_average) / 60.0, 1.0), 0.0)
    drop_probability = (
        slope_component * 0.45
        + distracted_component * 0.35
        + low_attention_component * 0.2
    )
    drop_probability = max(min(drop_probability, 1.0), 0.0)

    estimated_drop_in_minutes: Optional[int]
    if slope < 0 and current_average > 35:
        estimated = int(max((current_average - 35) / max(-slope, 0.01), 1))
        estimated_drop_in_minutes = min(estimated * 5, 120)
    else:
        estimated_drop_in_minutes = None

    if drop_probability >= 0.7:
        risk_level = "HIGH"
    elif drop_probability >= 0.4:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "current_average": _round2(current_average),
        "predicted_average_10m": _round2(predicted_10m),
        "predicted_average_20m": _round2(predicted_20m),
        "drop_probability": _round2(drop_probability),
        "estimated_drop_in_minutes": estimated_drop_in_minutes,
        "risk_level": risk_level,
    }


def _build_adaptive_suggestions(
    *,
    average_engagement: float,
    distracted_percent: float,
    row_heatmap: List[Dict[str, Any]],
    prediction: Dict[str, Any],
    elapsed_minutes: int,
    topic_difficulty: str,
    time_of_day: str,
) -> List[Dict[str, str]]:
    suggestions: List[Dict[str, str]] = []

    if average_engagement < 55:
        suggestions.append(
            {
                "title": "Switch to active recall",
                "reason": "Class-wide engagement is trending low.",
                "recommendation": "Pause for a 2-minute recall prompt or rapid quiz to re-focus attention.",
                "priority": "HIGH",
            }
        )

    if prediction["risk_level"] in {"HIGH", "MEDIUM"}:
        next_drop = prediction.get("estimated_drop_in_minutes")
        timing = f" in ~{next_drop} minutes" if next_drop else ""
        suggestions.append(
            {
                "title": "Proactive intervention window",
                "reason": f"Attention drop risk is {prediction['risk_level'].lower()}{timing}.",
                "recommendation": "Inject a short discussion checkpoint before the predicted drop period.",
                "priority": "HIGH" if prediction["risk_level"] == "HIGH" else "MEDIUM",
            }
        )

    if len(row_heatmap) >= 2:
        top_row = max(row_heatmap, key=lambda row: row["average_engagement"])
        bottom_row = min(row_heatmap, key=lambda row: row["average_engagement"])
        if (top_row["average_engagement"] - bottom_row["average_engagement"]) >= 15:
            suggestions.append(
                {
                    "title": "Row-targeted questioning",
                    "reason": "Engagement differs significantly across rows.",
                    "recommendation": (
                        f"Call on row {bottom_row['row_index']} first, then rotate to row "
                        f"{top_row['row_index']} for peer explanation."
                    ),
                    "priority": "MEDIUM",
                }
            )

    if topic_difficulty == "HIGH" and elapsed_minutes >= 25:
        suggestions.append(
            {
                "title": "Chunk difficult material",
                "reason": "Complex topic + elapsed time can increase cognitive fatigue.",
                "recommendation": "Break the concept into smaller checkpoints and summarize each before moving on.",
                "priority": "MEDIUM",
            }
        )

    if distracted_percent >= 35:
        suggestions.append(
            {
                "title": "Reset classroom focus",
                "reason": "Distracted participant share is elevated.",
                "recommendation": "Use a brief stand-up stretch or attention reset before continuing.",
                "priority": "HIGH",
            }
        )

    if time_of_day == "Night":
        suggestions.append(
            {
                "title": "Increase interaction cadence",
                "reason": "Late sessions usually need higher interaction frequency.",
                "recommendation": "Insert micro-interactions every 8-10 minutes to sustain attention.",
                "priority": "LOW",
            }
        )

    if not suggestions:
        suggestions.append(
            {
                "title": "Maintain current pacing",
                "reason": "Engagement is stable across participants.",
                "recommendation": "Continue current strategy and re-check trends in the next interval.",
                "priority": "LOW",
            }
        )

    return suggestions


async def get_latest_engagement_snapshot(
    db: AsyncSession,
    session_id: int,
) -> Dict[str, Any]:
    signals = await get_session_signals(db, session_id=session_id)
    payload = _build_snapshot_payload(signals)
    return {
        "students": payload["students"],
        "class_stats": payload["class_stats"],
    }


async def get_session_engagement_insights(
    db: AsyncSession,
    session_id: int,
    *,
    topic_difficulty: Optional[str] = None,
    local_hour: Optional[int] = None,
) -> Dict[str, Any]:
    session = await db.get(ClassSession, session_id)
    if not session:
        raise ValueError("Session not found")

    signals = await get_session_signals(db, session_id=session_id)
    snapshot_payload = _build_snapshot_payload(signals)

    latest_by_key = snapshot_payload["_latest_by_key"]
    row_lookup = snapshot_payload["_row_lookup"]
    class_stats = snapshot_payload["class_stats"]

    row_heatmap = _build_row_heatmap(latest_by_key, row_lookup)

    anchor_time = (
        session.started_at
        or session.scheduled_start
        or (signals[0].timestamp if signals else datetime.now(timezone.utc))
    )
    session_heatmap = _build_session_heatmap(signals, anchor=anchor_time)

    prediction = _predict_attention_drop(
        class_stats["trend"],
        class_stats["distracted_percent"],
    )

    now_utc = datetime.now(timezone.utc)
    elapsed_minutes = 0
    if session.started_at:
        elapsed_minutes = max(int((now_utc - _to_utc(session.started_at)).total_seconds() // 60), 0)
    elif session.scheduled_start:
        elapsed_minutes = max(int((now_utc - _to_utc(session.scheduled_start)).total_seconds() // 60), 0)

    current_hour = int(local_hour) if local_hour is not None else now_utc.hour
    current_hour = max(0, min(current_hour, 23))
    normalized_difficulty = _difficulty_label(topic_difficulty)
    time_of_day = _time_of_day_label(current_hour)

    suggestions = _build_adaptive_suggestions(
        average_engagement=class_stats["average_engagement"],
        distracted_percent=class_stats["distracted_percent"],
        row_heatmap=row_heatmap,
        prediction=prediction,
        elapsed_minutes=elapsed_minutes,
        topic_difficulty=normalized_difficulty,
        time_of_day=time_of_day,
    )

    return {
        "students": snapshot_payload["students"],
        "class_stats": class_stats,
        "row_heatmap": row_heatmap,
        "session_heatmap": session_heatmap,
        "prediction": prediction,
        "context": {
            "topic_difficulty": normalized_difficulty,
            "time_of_day": time_of_day,
            "elapsed_minutes": elapsed_minutes,
            "session_status": session.status,
        },
        "adaptive_suggestions": suggestions,
        "privacy": {
            "identity_storage": False,
            "stored_representation": "anonymized numerical scores",
            "face_images_stored": False,
        },
    }


async def seed_demo_signals(
    db: AsyncSession,
    session_id: int,
    *,
    samples: int = 24,
    rows: int = 4,
) -> int:
    session = await db.get(ClassSession, session_id)
    if not session:
        raise ValueError("Session not found")
    if session.status != SessionStatus.LIVE.value:
        raise ValueError("Session must be live to generate demo signals")
    if not session.tracking_enabled:
        raise ValueError("Tracking is disabled for this session")

    samples = max(1, min(samples, 240))
    rows = max(1, min(rows, 10))

    anchor = datetime.now(timezone.utc) - timedelta(seconds=samples * 20)
    created = 0
    for index in range(samples):
        row_index = (index % rows) + 1
        progression = index / max(samples - 1, 1)
        drift = progression * 0.22
        row_penalty = row_index * 0.05

        visual_attention = _clamp_unit(0.82 - row_penalty - drift + random.uniform(-0.07, 0.05))
        participation = _clamp_unit(0.6 - drift * 0.7 + random.uniform(-0.08, 0.08))
        quiz_accuracy = _clamp_unit(0.74 - drift * 0.5 + random.uniform(-0.12, 0.07))
        attendance_consistency = _clamp_unit(0.96 - drift * 0.2)

        score, category = compute_engagement_score(
            visual_attention=visual_attention,
            participation=participation,
            quiz_accuracy=quiz_accuracy,
            attendance_consistency=attendance_consistency,
        )

        timestamp = anchor + timedelta(seconds=index * 20)
        signal = EngagementSignal(
            session_id=session_id,
            student_id=None,
            timestamp=timestamp,
            visual_attention=visual_attention,
            participation=participation,
            quiz_accuracy=quiz_accuracy,
            attendance_consistency=attendance_consistency,
            engagement_score=score,
            category=category,
            raw={
                "source": "demo",
                "seat_row": row_index,
                "anon_id": f"demo-{row_index}-{index % 8}",
                "head_pose_yaw": _round2(random.uniform(-22, 22)),
                "head_pose_pitch": _round2(random.uniform(-14, 14)),
                "movement_intensity": _round2(random.uniform(0.15, 0.8)),
            },
        )
        db.add(signal)
        created += 1

    await db.flush()
    return created


async def compute_and_store_summary(db: AsyncSession, session_id: int) -> SessionSummary:
    snapshot = await get_latest_engagement_snapshot(db, session_id)
    class_stats = snapshot["class_stats"]

    # Upsert summary
    result = await db.execute(
        select(SessionSummary).where(SessionSummary.session_id == session_id)
    )
    summary = result.scalar_one_or_none()
    if not summary:
        summary = SessionSummary(session_id=session_id)
        db.add(summary)

    summary.average_engagement = class_stats["average_engagement"]
    summary.distracted_percent = class_stats["distracted_percent"]
    summary.trend = class_stats["trend"]
    summary.computed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(summary)
    return summary


async def get_session_summary(
    db: AsyncSession,
    session_id: int,
    *,
    recompute_if_missing: bool = True,
) -> Optional[SessionSummary]:
    result = await db.execute(
        select(SessionSummary).where(SessionSummary.session_id == session_id)
    )
    summary = result.scalar_one_or_none()
    if summary or not recompute_if_missing:
        return summary
    return await compute_and_store_summary(db, session_id)

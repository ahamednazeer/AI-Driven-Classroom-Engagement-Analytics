"""
Session management API routes.
"""

import asyncio
import base64
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import ProgrammingError

from app.database import get_db, AsyncSessionLocal
from app.models.user import User, UserRole, AccountStatus
from app.schemas.session import (
    SessionCreate,
    SessionResponse,
    SessionListResponse,
    SessionStartResponse,
    SessionEndResponse,
    SessionJoinRequest,
    ParticipantResponse,
    EngagementSignalCreate,
    EngagementSignalResponse,
    BehavioralSignalCreate,
    EngagementSnapshotResponse,
    EngagementInsightsResponse,
    SessionSummaryResponse,
    DemoSignalSeedResponse,
    SessionQuizCreate,
    SessionQuizResponsePayload,
    SessionQuizListResponse,
    SessionQuizItem,
    SessionQuizAnswerResponse,
    StudentQuizStats,
)
from app.services.session_service import (
    create_session,
    list_sessions,
    start_session,
    end_session,
    join_session,
    list_participants,
    get_session_by_id,
    record_signal,
    derive_metrics_from_behavioral_features,
    get_latest_engagement_snapshot,
    get_session_engagement_insights,
    get_session_summary,
    seed_demo_signals,
    create_session_quiz,
    close_session_quiz,
    list_session_quizzes,
    get_active_quizzes_for_student,
    submit_quiz_response,
    get_student_quiz_stats,
    get_student_quiz_accuracy_for_signal,
)
from app.middleware.rbac import get_current_user, require_teacher
from app.config import settings
from app.services.auth_service import decode_access_token
from app.services.jitsi_service import build_jitsi_token
from app.services.face_service import compute_visual_attention_features
from app.services.user_service import get_user_by_id

router = APIRouter(prefix="/api/v1/sessions", tags=["Sessions"])

QUIZ_SCHEMA_NOT_READY_DETAIL = "Quiz tables are not ready. Run `alembic upgrade head` in backend and restart the API."


class _EngagementWsClient:
    def __init__(self, websocket: WebSocket, user: User):
        self.websocket = websocket
        self.user_id = int(user.id)
        self.role = user.role
        self.topic_difficulty = "MEDIUM"
        self.local_hour: Optional[int] = None


class _EngagementWsHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._clients: Dict[int, List[_EngagementWsClient]] = {}

    async def add(self, session_id: int, client: _EngagementWsClient) -> None:
        async with self._lock:
            self._clients.setdefault(session_id, []).append(client)

    async def remove(self, session_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            clients = self._clients.get(session_id, [])
            self._clients[session_id] = [client for client in clients if client.websocket is not websocket]
            if not self._clients[session_id]:
                self._clients.pop(session_id, None)

    async def list(self, session_id: int) -> List[_EngagementWsClient]:
        async with self._lock:
            return list(self._clients.get(session_id, []))


engagement_ws_hub = _EngagementWsHub()


def _assert_session_access(session, current_user: User) -> None:
    if current_user.role == UserRole.TEACHER and session.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user.role == UserRole.STUDENT and session.class_id != current_user.classroom_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _resolve_signal_student_id(current_user: User, requested_student_id: Optional[int]) -> Optional[int]:
    if current_user.role == UserRole.STUDENT:
        if requested_student_id and requested_student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Students can only submit their own signals")
        return current_user.id
    return requested_student_id


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _is_quiz_schema_missing(exc: Exception) -> bool:
    text = str(exc).lower()
    return ("undefinedtableerror" in text and "session_quiz" in text) or ('relation "session_quiz' in text)


def _raise_if_quiz_schema_missing(exc: Exception) -> None:
    if _is_quiz_schema_missing(exc):
        raise HTTPException(status_code=503, detail=QUIZ_SCHEMA_NOT_READY_DETAIL) from exc


def _normalize_topic_difficulty(value: Optional[str]) -> str:
    if not value:
        return "MEDIUM"
    normalized = str(value).strip().upper()
    return normalized if normalized in {"LOW", "MEDIUM", "HIGH"} else "MEDIUM"


def _normalize_local_hour(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        hour = int(value)
    except (TypeError, ValueError):
        return None
    return max(0, min(hour, 23))


async def _send_ws_json(session_id: int, client: _EngagementWsClient, payload: Dict[str, Any]) -> None:
    try:
        await client.websocket.send_json(jsonable_encoder(payload))
    except Exception:
        await engagement_ws_hub.remove(session_id, client.websocket)


async def _send_engagement_update_to_client(
    db: AsyncSession,
    *,
    session_id: int,
    client: _EngagementWsClient,
) -> None:
    if client.role in (UserRole.TEACHER, UserRole.ADMIN):
        now_hour = datetime.now(timezone.utc).hour
        insights = await get_session_engagement_insights(
            db=db,
            session_id=session_id,
            topic_difficulty=client.topic_difficulty,
            local_hour=client.local_hour if client.local_hour is not None else now_hour,
        )
        await _send_ws_json(session_id, client, {"type": "insights_update", "insights": insights})
        return

    snapshot = await get_latest_engagement_snapshot(db, session_id)
    await _send_ws_json(session_id, client, {"type": "snapshot_update", "snapshot": snapshot})


async def _broadcast_engagement_update(db: AsyncSession, session_id: int) -> None:
    clients = await engagement_ws_hub.list(session_id)
    if not clients:
        return
    for client in clients:
        try:
            await _send_engagement_update_to_client(db, session_id=session_id, client=client)
        except Exception:
            await engagement_ws_hub.remove(session_id, client.websocket)


async def _resolve_ws_user(token: str) -> User:
    try:
        payload = decode_access_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    try:
        user_id = int(payload.get("sub"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token subject") from exc

    async with AsyncSessionLocal() as db:
        user = await get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if user.account_status == AccountStatus.SUSPENDED:
            raise HTTPException(status_code=403, detail="Account has been suspended")
        return user


@router.get("", response_model=SessionListResponse)
async def get_sessions(
    class_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.STUDENT:
        if not current_user.classroom_id:
            return SessionListResponse(sessions=[], total=0, page=page, per_page=per_page)
        class_id = current_user.classroom_id

    sessions, total = await list_sessions(
        db,
        role=current_user.role,
        user_id=current_user.id,
        class_id=class_id,
        status=status_filter,
        page=page,
        per_page=per_page,
    )
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_new_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    try:
        session = await create_session(
            db=db,
            teacher_id=current_user.id,
            class_id=body.class_id,
            course=body.course,
            subject=body.subject,
            topic=body.topic,
            scheduled_start=body.scheduled_start,
            scheduled_end=body.scheduled_end,
            tracking_enabled=body.tracking_enabled,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SessionResponse.model_validate(session)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    return SessionResponse.model_validate(session)


@router.post("/{session_id}/start", response_model=SessionStartResponse)
async def start_session_route(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    try:
        session = await start_session(db, session_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SessionStartResponse(
        id=session.id,
        status=session.status,
        started_at=session.started_at,
    )


@router.post("/{session_id}/end", response_model=SessionEndResponse)
async def end_session_route(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    try:
        session = await end_session(db, session_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SessionEndResponse(
        id=session.id,
        status=session.status,
        ended_at=session.ended_at,
    )


@router.post("/{session_id}/join", response_model=ParticipantResponse)
async def join_session_route(
    session_id: int,
    body: SessionJoinRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Students only")
    try:
        participant = await join_session(
            db,
            session_id=session_id,
            student_id=current_user.id,
            auth_type=body.auth_type,
            device_info=body.device_info,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ParticipantResponse.model_validate(participant)


@router.get("/{session_id}/participants", response_model=list[ParticipantResponse])
async def list_session_participants(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.TEACHER):
        raise HTTPException(status_code=403, detail="Access denied")
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    participants = await list_participants(db, session_id)
    return [ParticipantResponse.model_validate(p) for p in participants]


@router.post("/{session_id}/signals", response_model=EngagementSignalResponse, status_code=status.HTTP_201_CREATED)
async def record_engagement_signal(
    session_id: int,
    body: EngagementSignalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)

    if current_user.role == UserRole.STUDENT:
        participants = await list_participants(db, session_id)
        is_joined = any(p.student_id == current_user.id for p in participants)
        if not is_joined:
            raise HTTPException(status_code=400, detail="Join session before submitting signals")

    student_id = _resolve_signal_student_id(current_user, body.student_id)
    quiz_accuracy = body.quiz_accuracy
    if student_id is not None:
        try:
            quiz_accuracy = await get_student_quiz_accuracy_for_signal(
                db,
                session_id=session_id,
                student_id=student_id,
                fallback=body.quiz_accuracy,
            )
        except ProgrammingError as exc:
            _raise_if_quiz_schema_missing(exc)
            raise

    try:
        signal = await record_signal(
            db=db,
            session_id=session_id,
            student_id=student_id,
            visual_attention=body.visual_attention,
            participation=body.participation,
            quiz_accuracy=quiz_accuracy,
            attendance_consistency=body.attendance_consistency,
            raw=body.raw,
        )
        await _broadcast_engagement_update(db, session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return EngagementSignalResponse.model_validate(signal)


@router.post("/{session_id}/signals/behavioral", response_model=EngagementSignalResponse, status_code=status.HTTP_201_CREATED)
async def record_behavioral_signal(
    session_id: int,
    body: BehavioralSignalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)

    if current_user.role == UserRole.STUDENT:
        participants = await list_participants(db, session_id)
        is_joined = any(p.student_id == current_user.id for p in participants)
        if not is_joined:
            raise HTTPException(status_code=400, detail="Join session before submitting signals")

    visual_attention, participation, quiz_accuracy, attendance_consistency = derive_metrics_from_behavioral_features(
        head_pose_yaw=body.head_pose_yaw,
        head_pose_pitch=body.head_pose_pitch,
        posture_score=body.posture_score,
        gaze_score=body.gaze_score,
        movement_intensity=body.movement_intensity,
        participation_event=body.participation_event,
        quiz_correct=body.quiz_correct,
        attendance_consistency=body.attendance_consistency,
    )

    raw_payload = dict(body.raw or {})
    raw_payload.update(
        {
            "source": "behavioral",
            "head_pose_yaw": body.head_pose_yaw,
            "head_pose_pitch": body.head_pose_pitch,
            "posture_score": body.posture_score,
            "gaze_score": body.gaze_score,
            "movement_intensity": body.movement_intensity,
            "participation_event": body.participation_event,
            "quiz_correct": body.quiz_correct,
        }
    )
    if body.seat_row is not None:
        raw_payload["seat_row"] = body.seat_row

    student_id = _resolve_signal_student_id(current_user, body.student_id)
    if student_id is not None:
        try:
            quiz_accuracy = await get_student_quiz_accuracy_for_signal(
                db,
                session_id=session_id,
                student_id=student_id,
                fallback=quiz_accuracy,
            )
        except ProgrammingError as exc:
            _raise_if_quiz_schema_missing(exc)
            raise

    try:
        signal = await record_signal(
            db=db,
            session_id=session_id,
            student_id=student_id,
            visual_attention=visual_attention,
            participation=participation,
            quiz_accuracy=quiz_accuracy,
            attendance_consistency=attendance_consistency,
            raw=raw_payload,
        )
        await _broadcast_engagement_update(db, session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return EngagementSignalResponse.model_validate(signal)


@router.post("/{session_id}/signals/vision", response_model=EngagementSignalResponse, status_code=status.HTTP_201_CREATED)
async def record_vision_signal(
    session_id: int,
    file: UploadFile = File(...),
    student_id: Optional[int] = Form(None),
    participation: Optional[float] = Form(None),
    attendance_consistency: Optional[float] = Form(None),
    interaction_recency_seconds: Optional[float] = Form(None),
    interaction_events: Optional[int] = Form(None),
    movement_intensity: Optional[float] = Form(None),
    seat_row: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image frame")
    content = await file.read()
    max_size = max(settings.VISION_SIGNAL_MAX_IMAGE_MB, 1) * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Max allowed size: {settings.VISION_SIGNAL_MAX_IMAGE_MB}MB",
        )

    resolved_student_id = _resolve_signal_student_id(current_user, student_id)
    if current_user.role == UserRole.STUDENT:
        participants = await list_participants(db, session_id)
        is_joined = any(p.student_id == current_user.id for p in participants)
        if not is_joined:
            raise HTTPException(status_code=400, detail="Join session before submitting signals")

    try:
        vision_features = compute_visual_attention_features(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if participation is None:
        recency = float(interaction_recency_seconds or 30.0)
        recency_score = 1.0 if recency <= 15 else (0.72 if recency <= 45 else (0.42 if recency <= 90 else 0.18))
        burst = _clamp_unit((interaction_events or 0) / 12.0)
        motion = _clamp_unit(movement_intensity if movement_intensity is not None else 0.32)
        participation_value = _clamp_unit(0.2 + (0.45 * burst) + (0.25 * recency_score) + (0.1 * motion))
    else:
        participation_value = _clamp_unit(participation)

    attendance_value = _clamp_unit(attendance_consistency if attendance_consistency is not None else 1.0)
    quiz_accuracy = 0.55
    if resolved_student_id is not None:
        try:
            quiz_accuracy = await get_student_quiz_accuracy_for_signal(
                db,
                session_id=session_id,
                student_id=resolved_student_id,
                fallback=quiz_accuracy,
            )
        except ProgrammingError as exc:
            _raise_if_quiz_schema_missing(exc)
            raise

    raw_payload = {
        "source": "vision",
        "seat_row": seat_row,
        "interaction_recency_seconds": interaction_recency_seconds,
        "interaction_events": interaction_events,
        "movement_intensity": movement_intensity,
        "gaze_score": vision_features["gaze_score"],
        "posture_score": vision_features["posture_score"],
        "head_pose_yaw": vision_features["head_pose_yaw"],
        "head_pose_pitch": vision_features["head_pose_pitch"],
        "head_roll": vision_features["head_roll"],
        "face_count": vision_features["face_count"],
        "confidence": vision_features["confidence"],
        "size_ratio": vision_features["size_ratio"],
    }

    try:
        signal = await record_signal(
            db=db,
            session_id=session_id,
            student_id=resolved_student_id,
            visual_attention=vision_features["visual_attention"],
            participation=participation_value,
            quiz_accuracy=quiz_accuracy,
            attendance_consistency=attendance_value,
            raw=raw_payload,
        )
        await _broadcast_engagement_update(db, session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return EngagementSignalResponse.model_validate(signal)


@router.websocket("/{session_id}/engagement/ws")
async def engagement_socket(websocket: WebSocket, session_id: int):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="Authentication required")
        return

    try:
        current_user = await _resolve_ws_user(token)
    except HTTPException as exc:
        await websocket.close(code=4401, reason=str(exc.detail))
        return

    async with AsyncSessionLocal() as db:
        session = await get_session_by_id(db, session_id)
        if not session:
            await websocket.close(code=4404, reason="Session not found")
            return
        try:
            _assert_session_access(session, current_user)
        except HTTPException as exc:
            await websocket.close(code=4403, reason=str(exc.detail))
            return

    await websocket.accept()
    client = _EngagementWsClient(websocket, current_user)
    await engagement_ws_hub.add(session_id, client)

    async with AsyncSessionLocal() as db:
        try:
            await _send_ws_json(
                session_id,
                client,
                {
                    "type": "connected",
                    "session_id": session_id,
                    "role": current_user.role.value,
                },
            )
            await _send_engagement_update_to_client(db, session_id=session_id, client=client)
        except Exception:
            pass

    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except ValueError:
                await _send_ws_json(session_id, client, {"type": "error", "detail": "Invalid JSON payload"})
                continue

            message_type = str(payload.get("type") or "").strip().lower()

            if message_type == "ping":
                await _send_ws_json(session_id, client, {"type": "pong"})
                continue

            if message_type == "subscribe_insights":
                client.topic_difficulty = _normalize_topic_difficulty(payload.get("topic_difficulty"))
                client.local_hour = _normalize_local_hour(payload.get("local_hour"))
                async with AsyncSessionLocal() as db:
                    try:
                        await _send_engagement_update_to_client(db, session_id=session_id, client=client)
                    except ValueError:
                        await _send_ws_json(session_id, client, {"type": "error", "detail": "Session not found"})
                continue

            if message_type != "vision_sample":
                await _send_ws_json(session_id, client, {"type": "error", "detail": "Unsupported message type"})
                continue

            if client.role != UserRole.STUDENT:
                await _send_ws_json(session_id, client, {"type": "error", "detail": "Only students can submit signals"})
                continue

            image_base64 = payload.get("image_base64")
            if not isinstance(image_base64, str) or not image_base64.strip():
                await _send_ws_json(session_id, client, {"type": "error", "detail": "image_base64 is required"})
                continue

            raw_image = image_base64.strip()
            if "," in raw_image:
                raw_image = raw_image.split(",", 1)[1]

            try:
                image_bytes = base64.b64decode(raw_image, validate=True)
            except Exception:
                await _send_ws_json(session_id, client, {"type": "error", "detail": "Invalid base64 image payload"})
                continue

            max_size = max(settings.VISION_SIGNAL_MAX_IMAGE_MB, 1) * 1024 * 1024
            if len(image_bytes) > max_size:
                await _send_ws_json(
                    session_id,
                    client,
                    {"type": "error", "detail": f"Image too large (max {settings.VISION_SIGNAL_MAX_IMAGE_MB}MB)"},
                )
                continue

            try:
                vision_features = compute_visual_attention_features(image_bytes)
            except Exception as exc:
                await _send_ws_json(session_id, client, {"type": "error", "detail": str(exc)})
                continue

            try:
                attendance_value = _clamp_unit(payload.get("attendance_consistency", 1.0))
                provided_participation = payload.get("participation")
                recency = float(payload.get("interaction_recency_seconds") or 30.0)
                recency_score = 1.0 if recency <= 15 else (0.72 if recency <= 45 else (0.42 if recency <= 90 else 0.18))
                burst = _clamp_unit((payload.get("interaction_events") or 0) / 12.0)
                motion = _clamp_unit(payload.get("movement_intensity") if payload.get("movement_intensity") is not None else 0.32)
                participation_value = (
                    _clamp_unit(0.2 + (0.45 * burst) + (0.25 * recency_score) + (0.1 * motion))
                    if provided_participation is None
                    else _clamp_unit(provided_participation)
                )
            except (TypeError, ValueError):
                await _send_ws_json(session_id, client, {"type": "error", "detail": "Invalid numeric payload"})
                continue

            async with AsyncSessionLocal() as db:
                try:
                    session = await get_session_by_id(db, session_id)
                    if not session:
                        await _send_ws_json(session_id, client, {"type": "error", "detail": "Session not found"})
                        continue
                    _assert_session_access(session, current_user)

                    participants = await list_participants(db, session_id)
                    is_joined = any(p.student_id == current_user.id for p in participants)
                    if not is_joined:
                        await _send_ws_json(session_id, client, {"type": "error", "detail": "Join session before submitting signals"})
                        continue

                    quiz_accuracy = 0.55
                    try:
                        quiz_accuracy = await get_student_quiz_accuracy_for_signal(
                            db,
                            session_id=session_id,
                            student_id=current_user.id,
                            fallback=quiz_accuracy,
                        )
                    except ProgrammingError as exc:
                        if _is_quiz_schema_missing(exc):
                            await db.rollback()
                            quiz_accuracy = 0.55
                        else:
                            raise

                    signal = await record_signal(
                        db=db,
                        session_id=session_id,
                        student_id=current_user.id,
                        visual_attention=vision_features["visual_attention"],
                        participation=participation_value,
                        quiz_accuracy=quiz_accuracy,
                        attendance_consistency=attendance_value,
                        raw={
                            "source": "vision-ws",
                            "interaction_recency_seconds": recency,
                            "interaction_events": payload.get("interaction_events"),
                            "movement_intensity": payload.get("movement_intensity"),
                            "seat_row": payload.get("seat_row"),
                            "gaze_score": vision_features["gaze_score"],
                            "posture_score": vision_features["posture_score"],
                            "head_pose_yaw": vision_features["head_pose_yaw"],
                            "head_pose_pitch": vision_features["head_pose_pitch"],
                            "head_roll": vision_features["head_roll"],
                            "face_count": vision_features["face_count"],
                            "confidence": vision_features["confidence"],
                            "size_ratio": vision_features["size_ratio"],
                        },
                    )
                    face_count = int(vision_features.get("face_count") or 0)
                    await _send_ws_json(
                        session_id,
                        client,
                        {
                            "type": "signal_ack",
                            "signal": EngagementSignalResponse.model_validate(signal),
                            "vision": {
                                "face_visible": face_count > 0,
                                "face_count": face_count,
                                "confidence": _clamp_unit(vision_features.get("confidence", 0.0)),
                            },
                        },
                    )
                    await _broadcast_engagement_update(db, session_id)
                    await db.commit()
                except ValueError as exc:
                    await db.rollback()
                    await _send_ws_json(session_id, client, {"type": "error", "detail": str(exc)})
                except HTTPException as exc:
                    await db.rollback()
                    await _send_ws_json(session_id, client, {"type": "error", "detail": str(exc.detail)})
                except ProgrammingError as exc:
                    await db.rollback()
                    if _is_quiz_schema_missing(exc):
                        await _send_ws_json(session_id, client, {"type": "error", "detail": QUIZ_SCHEMA_NOT_READY_DETAIL})
                    else:
                        await _send_ws_json(session_id, client, {"type": "error", "detail": "Database error"})
                except Exception:
                    await db.rollback()
                    await _send_ws_json(session_id, client, {"type": "error", "detail": "Unable to process signal"})
    except WebSocketDisconnect:
        pass
    finally:
        await engagement_ws_hub.remove(session_id, websocket)


@router.get("/{session_id}/engagement/snapshot", response_model=EngagementSnapshotResponse)
async def get_engagement_snapshot(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    return await get_latest_engagement_snapshot(db, session_id)


@router.get("/{session_id}/engagement/insights", response_model=EngagementInsightsResponse)
async def get_engagement_insights(
    session_id: int,
    topic_difficulty: Optional[str] = Query(None, description="LOW, MEDIUM, HIGH"),
    local_hour: Optional[int] = Query(None, ge=0, le=23),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    try:
        return await get_session_engagement_insights(
            db=db,
            session_id=session_id,
            topic_difficulty=topic_difficulty,
            local_hour=local_hour,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{session_id}/summary", response_model=SessionSummaryResponse)
async def get_session_summary_route(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    summary = await get_session_summary(db, session_id, recompute_if_missing=True)
    if not summary:
        raise HTTPException(status_code=404, detail="Session summary not available")
    return SessionSummaryResponse.model_validate(summary)


@router.post("/{session_id}/engagement/simulate", response_model=DemoSignalSeedResponse)
async def seed_demo_signals_route(
    session_id: int,
    samples: int = Query(24, ge=1, le=240),
    rows: int = Query(4, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(status_code=403, detail="Demo engagement simulation is disabled in real-only mode")


@router.post("/{session_id}/quizzes", response_model=SessionQuizItem, status_code=status.HTTP_201_CREATED)
async def create_quiz_checkpoint(
    session_id: int,
    body: SessionQuizCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    try:
        quiz = await create_session_quiz(
            db,
            session_id=session_id,
            teacher_id=current_user.id,
            question=body.question,
            options=body.options,
            correct_option_index=body.correct_option_index,
            duration_seconds=body.duration_seconds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProgrammingError as exc:
        _raise_if_quiz_schema_missing(exc)
        raise
    return SessionQuizItem(
        id=quiz.id,
        session_id=quiz.session_id,
        teacher_id=quiz.teacher_id,
        question=quiz.question,
        options=list(quiz.options or []),
        correct_option_index=quiz.correct_option_index,
        duration_seconds=int(quiz.duration_seconds or 60),
        expires_at=quiz.expires_at,
        remaining_seconds=max(int((quiz.expires_at - datetime.now(timezone.utc)).total_seconds()), 0) if quiz.expires_at else None,
        is_active=quiz.is_active,
        created_at=quiz.created_at,
        closed_at=quiz.closed_at,
        total_responses=0,
        correct_responses=0,
    )


@router.patch("/{session_id}/quizzes/{quiz_id}/close", response_model=SessionQuizItem)
async def close_quiz_checkpoint(
    session_id: int,
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    try:
        await close_session_quiz(
            db,
            session_id=session_id,
            quiz_id=quiz_id,
            teacher_id=current_user.id,
        )
        quizzes = await list_session_quizzes(
            db,
            session_id=session_id,
            include_inactive=True,
            include_correct_option=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProgrammingError as exc:
        _raise_if_quiz_schema_missing(exc)
        raise
    item = next((quiz for quiz in quizzes if int(quiz["id"]) == quiz_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return SessionQuizItem(**item)


@router.get("/{session_id}/quizzes", response_model=SessionQuizListResponse)
async def list_quiz_checkpoints(
    session_id: int,
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    try:
        quizzes = await list_session_quizzes(
            db,
            session_id=session_id,
            include_inactive=not active_only,
            include_correct_option=current_user.role != UserRole.STUDENT,
            student_id=current_user.id if current_user.role == UserRole.STUDENT else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProgrammingError as exc:
        _raise_if_quiz_schema_missing(exc)
        raise
    return SessionQuizListResponse(quizzes=[SessionQuizItem(**item) for item in quizzes])


@router.get("/{session_id}/quizzes/active", response_model=SessionQuizListResponse)
async def list_active_quizzes(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    try:
        if current_user.role == UserRole.STUDENT:
            quizzes = await get_active_quizzes_for_student(
                db,
                session_id=session_id,
                student_id=current_user.id,
            )
        else:
            quizzes = await list_session_quizzes(
                db,
                session_id=session_id,
                include_inactive=False,
                include_correct_option=True,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProgrammingError as exc:
        _raise_if_quiz_schema_missing(exc)
        raise
    return SessionQuizListResponse(quizzes=[SessionQuizItem(**item) for item in quizzes])


@router.post("/{session_id}/quizzes/{quiz_id}/answers", response_model=SessionQuizAnswerResponse, status_code=status.HTTP_201_CREATED)
async def submit_quiz_answer(
    session_id: int,
    quiz_id: int,
    body: SessionQuizResponsePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Students only")
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    try:
        result = await submit_quiz_response(
            db,
            session_id=session_id,
            quiz_id=quiz_id,
            student_id=current_user.id,
            selected_option_index=body.selected_option_index,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProgrammingError as exc:
        _raise_if_quiz_schema_missing(exc)
        raise
    return SessionQuizAnswerResponse(**result)


@router.get("/{session_id}/quizzes/mine/stats", response_model=StudentQuizStats)
async def get_my_quiz_stats(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Students only")
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(session, current_user)
    try:
        return StudentQuizStats(
            **(await get_student_quiz_stats(db, session_id=session_id, student_id=current_user.id))
        )
    except ProgrammingError as exc:
        _raise_if_quiz_schema_missing(exc)
        raise


@router.get("/{session_id}/jitsi-token")
async def get_jitsi_token(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    _assert_session_access(session, current_user)

    if not settings.JITSI_APP_ID or not settings.JITSI_KID or (not settings.JITSI_PRIVATE_KEY and not settings.JITSI_PRIVATE_KEY_PATH):
        raise HTTPException(status_code=500, detail="JaaS is not configured on the server")

    base_room = f"classroom-{session.session_code.lower()}"
    room = f"{settings.JITSI_APP_ID}/{base_room}"
    name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.username
    token = build_jitsi_token(
        room=room,
        name=name,
        email=current_user.email,
        is_moderator=current_user.role == UserRole.TEACHER,
    )

    return {
        "domain": settings.JITSI_DOMAIN,
        "room": room,
        "jwt": token,
        "app_id": settings.JITSI_APP_ID,
        "moderator": current_user.role == UserRole.TEACHER,
    }

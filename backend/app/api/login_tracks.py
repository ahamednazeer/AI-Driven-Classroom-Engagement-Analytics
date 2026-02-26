"""
Login tracks API routes — standalone resource for audit trail.

Routes:
    GET  /api/v1/login-tracks  — List login attempts (filtered, limited)
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    LoginHistoryResponse,
    LoginTrackResponse,
)
from app.services.user_service import get_login_history
from app.middleware.rbac import require_admin

router = APIRouter(prefix="/api/v1/login-tracks", tags=["Login Tracks"])


@router.get("", response_model=LoginHistoryResponse)
async def list_login_tracks(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    List login attempts across the system.
    Supports filtering by user_id and limiting results.
    Admin only.
    """
    tracks = await get_login_history(db, user_id=user_id, limit=limit)
    return LoginHistoryResponse(
        tracks=[LoginTrackResponse.model_validate(t) for t in tracks],
        total=len(tracks),
    )

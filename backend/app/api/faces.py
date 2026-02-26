"""
Face management API routes — standalone resource.

Routes:
    GET    /api/v1/faces                       — List faces (filter by ?status=pending)
    PATCH  /api/v1/faces/{user_id}/approval    — Approve or reject a face
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserResponse,
    FaceApprovalRequest,
)
from app.services.user_service import (
    approve_face,
    get_pending_face_approvals,
)
from app.middleware.rbac import require_admin_or_teacher

router = APIRouter(prefix="/api/v1/faces", tags=["Faces"])


@router.get("", response_model=list[UserResponse])
async def list_faces(
    face_status: Optional[str] = Query(
        None, alias="status", description="Filter by face status (e.g., 'pending')"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_teacher),
):
    """
    List face submissions. Filter by status query parameter.
    Currently supports: ?status=pending
    Admin/Teacher only.
    """
    if face_status == "pending":
        users = await get_pending_face_approvals(db)
    else:
        # Default: return pending faces when no filter specified
        users = await get_pending_face_approvals(db)

    return [UserResponse.model_validate(u) for u in users]


@router.patch("/{user_id}/approval", response_model=UserResponse)
async def update_face_approval(
    user_id: int,
    body: FaceApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_teacher),
):
    """Approve or reject a student's face photo. Admin/Teacher only."""
    try:
        user = await approve_face(
            db, user_id, body.approved, current_user.id, body.rejection_reason
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return UserResponse.model_validate(user)

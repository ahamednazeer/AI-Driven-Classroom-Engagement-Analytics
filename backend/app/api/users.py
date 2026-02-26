"""
User management API routes.

Routes:
    GET    /api/v1/users                   — List users (filtered, paginated)
    POST   /api/v1/users                   — Create user
    GET    /api/v1/users/statistics         — System statistics
    GET    /api/v1/users/{user_id}         — Get user by ID
    PUT    /api/v1/users/{user_id}         — Update user
    DELETE /api/v1/users/{user_id}         — Delete user
    PATCH  /api/v1/users/{user_id}/status  — Update account status
    POST   /api/v1/users/me/face           — Upload face photo
    GET    /api/v1/users/me/login-tracks   — Current user's login history
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.models.user import User, UserRole
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    AccountStatusUpdate,
    LoginHistoryResponse,
    LoginTrackResponse,
)
from app.services.user_service import (
    create_user,
    get_user_by_id,
    get_users,
    update_user,
    delete_user,
    change_account_status,
    upload_face_image,
    get_system_stats,
    get_login_history,
)
from app.middleware.rbac import (
    get_current_user,
    require_admin,
)

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


# ─── Collection endpoints ────────────────────────────────────────────────────

@router.get("", response_model=UserListResponse)
async def list_users(
    role: Optional[str] = Query(None, description="Filter by role"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by account status"),
    class_section: Optional[str] = Query(None, description="Filter by class/section"),
    department: Optional[str] = Query(None, description="Filter by department"),
    classroom_id: Optional[int] = Query(None, description="Filter by assigned class ID"),
    search: Optional[str] = Query(None, description="Search by name, email, or username"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List users with filtering, search, and pagination. Admins; teachers can view students."""
    if current_user.role == UserRole.TEACHER:
        if role and role != "STUDENT":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teachers can only view students",
            )
        role = "STUDENT"
    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    users, total = await get_users(
        db,
        role=role,
        status=status_filter,
        search=search,
        class_section=class_section,
        department=department,
        classroom_id=classroom_id,
        page=page,
        per_page=per_page,
    )
    return UserListResponse(
        users=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Create a new user. Admin only.
    If no password is provided, a temporary password is generated.
    """
    try:
        user, temp_password = await create_user(
            db,
            username=body.username,
            email=body.email,
            first_name=body.first_name,
            last_name=body.last_name,
            role=body.role,
            password=body.password,
            department=body.department,
            student_id=body.student_id,
            batch=body.batch,
            class_section=body.class_section,
            classroom_id=body.classroom_id,
            phone=body.phone,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    response = {
        "user": UserResponse.model_validate(user).model_dump(),
        "message": "User created successfully",
    }
    if temp_password:
        response["temp_password"] = temp_password
        response["message"] = f"User created with temporary password: {temp_password}"

    return response


# ─── Statistics ───────────────────────────────────────────────────────────────

@router.get("/statistics")
async def get_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get system-wide user statistics. Admin only."""
    return await get_system_stats(db)


# ─── Current user sub-resources ──────────────────────────────────────────────

@router.post("/me/face", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def upload_face(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload face photo for the current user (primarily students)."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    max_size = settings.MAX_FACE_IMAGE_SIZE_MB * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.MAX_FACE_IMAGE_SIZE_MB}MB",
        )

    try:
        user = await upload_face_image(
            db, current_user.id, content, file.filename or "face.jpg"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return UserResponse.model_validate(user)


@router.get("/me/login-tracks", response_model=LoginHistoryResponse)
async def get_my_login_tracks(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's login history."""
    tracks = await get_login_history(db, user_id=current_user.id, limit=limit)
    return LoginHistoryResponse(
        tracks=[LoginTrackResponse.model_validate(t) for t in tracks],
        total=len(tracks),
    )


# ─── Individual user endpoints ───────────────────────────────────────────────

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get a specific user by ID. Admin only."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_existing_user(
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update a user. Admin only."""
    try:
        user = await update_user(db, user_id, **body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a user. Admin only. Cannot delete self."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    try:
        await delete_user(db, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{user_id}/status", response_model=UserResponse)
async def update_user_status(
    user_id: int,
    body: AccountStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update a user's account status (suspend/activate/lock). Admin only."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    try:
        user = await change_account_status(db, user_id, body.status, body.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return UserResponse.model_validate(user)

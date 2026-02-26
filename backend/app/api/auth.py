"""
Authentication API routes.

Routes:
    POST   /api/v1/auth/sessions   — Create session (login)
    GET    /api/v1/auth/me         — Get current authenticated user
    PUT    /api/v1/auth/password   — Update password
    PUT    /api/v1/auth/profile    — Update/complete profile setup
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, AccountStatus
from app.schemas.user import (
    LoginRequest,
    LoginResponse,
    ChangePasswordRequest,
    UserResponse,
    ProfileSetupComplete,
)
from app.services.auth_service import (
    authenticate_user,
    authenticate_user_by_face,
    create_access_token,
    hash_password,
    verify_password,
)
from app.services.user_service import complete_profile_setup
from app.middleware.rbac import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/sessions", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new authentication session (login).
    Returns JWT access token and user profile.
    Handles account locking, status checks, and login tracking.
    """
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:500]

    user, error = await authenticate_user(
        db, body.username, body.password, ip_address, user_agent
    )

    if error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error,
        )

    access_token = create_access_token(user.id, user.role.value)

    return LoginResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/face-login", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def face_login(
    username: str = Form(...),
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate using face image + username."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent", "")[:500] if request else None

    user, error = await authenticate_user_by_face(
        db, username, content, ip_address, user_agent
    )
    if error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error)

    access_token = create_access_token(user.id, user.role.value)
    return LoginResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    """Retrieve the currently authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.put("/password", response_model=UserResponse)
async def update_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update the current user's password.
    If user has a temporary password, transitions account:
        PENDING_FIRST_LOGIN → PROFILE_SETUP_REQUIRED
    """
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters",
        )

    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    current_user.password_hash = hash_password(body.new_password)
    current_user.is_temp_password = False

    if current_user.account_status == AccountStatus.PENDING_FIRST_LOGIN:
        current_user.account_status = AccountStatus.PROFILE_SETUP_REQUIRED

    await db.flush()
    await db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    body: ProfileSetupComplete,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update/complete the current user's profile.
    Transitions:
        PROFILE_SETUP_REQUIRED → FACE_PENDING  (students)
        PROFILE_SETUP_REQUIRED → ACTIVE         (teachers/admins)
    """
    if current_user.account_status not in (
        AccountStatus.PROFILE_SETUP_REQUIRED,
        AccountStatus.FACE_PENDING,
        AccountStatus.ACTIVE,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot complete profile in current state: {current_user.account_status.value}",
        )

    user = await complete_profile_setup(
        db,
        current_user.id,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        department=body.department,
    )

    return UserResponse.model_validate(user)

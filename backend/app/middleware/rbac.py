"""Role-Based Access Control middleware for FastAPI."""

from typing import List, Optional
from functools import wraps

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole, AccountStatus
from app.services.auth_service import decode_access_token
from app.services.user_service import get_user_by_id

# Bearer token extractor
security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Extract and validate the JWT token from the Authorization header.
    Returns the authenticated User object.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload.get("sub"))
    user = await get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if user.account_status == AccountStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended",
        )

    # Students must complete onboarding before accessing other endpoints
    if user.role == UserRole.STUDENT and user.account_status in (
        AccountStatus.PENDING_FIRST_LOGIN,
        AccountStatus.PROFILE_SETUP_REQUIRED,
    ):
        allowed_paths = {
            "/api/v1/auth/password",
            "/api/v1/auth/profile",
            "/api/v1/auth/me",
        }
        if request.url.path not in allowed_paths:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Complete profile setup before accessing other features",
            )

    return user


def require_role(*roles: str):
    """
    Dependency factory that creates a role-checking dependency.
    Usage: Depends(require_role("ADMIN", "TEACHER"))
    """
    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return current_user
    return role_checker


def require_active():
    """
    Dependency that ensures the user's account is fully ACTIVE.
    Use for endpoints that require complete onboarding.
    """
    async def active_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.account_status != AccountStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is not active. Current status: {current_user.account_status.value}",
            )
        return current_user
    return active_checker


# Convenience dependencies
require_admin = require_role("ADMIN")
require_teacher = require_role("TEACHER")
require_student = require_role("STUDENT")
require_admin_or_teacher = require_role("ADMIN", "TEACHER")

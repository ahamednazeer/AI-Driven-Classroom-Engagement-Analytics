"""Authentication service: JWT tokens, password hashing, and login management."""

import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User, LoginTrack, UserRole, AccountStatus
from app.services.face_service import compute_face_embedding, compare_embeddings

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


def generate_temp_password(length: int = 12) -> str:
    """Generate a secure temporary password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def create_access_token(user_id: int, role: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises JWTError on failure."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            raise JWTError("Invalid token type")
        return payload
    except JWTError:
        raise


async def authenticate_user(
    db: AsyncSession,
    username: str,
    password: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> tuple[Optional[User], Optional[str]]:
    """
    Authenticate a user by username and password.
    Returns (user, error_message). On success, error_message is None.
    Handles:
    - Account locking after too many failed attempts
    - Auto-unlock after lock duration
    - Login tracking
    """
    # Find user
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user:
        return None, "Invalid username or password"

    # Check if account is suspended
    if user.account_status == AccountStatus.SUSPENDED:
        await _track_login(db, user.id, ip_address, user_agent, False, "Account suspended")
        return None, "Account has been suspended. Contact your administrator."

    # Check if account is locked and whether lock has expired
    if user.account_status == AccountStatus.LOCKED:
        if user.locked_at:
            lock_expires = user.locked_at + timedelta(minutes=settings.LOCK_DURATION_MINUTES)
            if datetime.now(timezone.utc) > lock_expires:
                # Auto-unlock
                user.account_status = AccountStatus.ACTIVE if not user.is_temp_password else AccountStatus.PENDING_FIRST_LOGIN
                user.failed_login_attempts = 0
                user.locked_at = None
            else:
                remaining = int((lock_expires - datetime.now(timezone.utc)).total_seconds() / 60)
                await _track_login(db, user.id, ip_address, user_agent, False, "Account locked")
                return None, f"Account is locked. Try again in {remaining} minutes."
        else:
            await _track_login(db, user.id, ip_address, user_agent, False, "Account locked")
            return None, "Account is locked. Contact your administrator."

    # Verify password
    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1

        # Lock account if max attempts exceeded
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.account_status = AccountStatus.LOCKED
            user.locked_at = datetime.now(timezone.utc)
            await _track_login(db, user.id, ip_address, user_agent, False, "Max attempts exceeded — locked")
            await db.flush()
            return None, f"Too many failed attempts. Account locked for {settings.LOCK_DURATION_MINUTES} minutes."

        await _track_login(db, user.id, ip_address, user_agent, False, "Invalid password")
        remaining = settings.MAX_FAILED_LOGIN_ATTEMPTS - user.failed_login_attempts
        await db.flush()
        return None, f"Invalid username or password. {remaining} attempts remaining."

    # Successful login — reset counters
    user.failed_login_attempts = 0
    user.locked_at = None
    user.last_login_at = datetime.now(timezone.utc)

    await _track_login(db, user.id, ip_address, user_agent, True, None)
    await db.flush()

    return user, None


async def _track_login(
    db: AsyncSession,
    user_id: int,
    ip_address: Optional[str],
    user_agent: Optional[str],
    success: bool,
    failure_reason: Optional[str],
):
    """Record a login attempt."""
    track = LoginTrack(
        user_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        success=success,
        failure_reason=failure_reason,
    )
    db.add(track)
    await db.flush()


async def authenticate_user_by_face(
    db: AsyncSession,
    username: str,
    image_bytes: bytes,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> tuple[Optional[User], Optional[str]]:
    """
    Authenticate user by face image.
    Requires approved face and stored embedding.
    """
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user:
        return None, "Invalid username or face"

    if user.account_status == AccountStatus.SUSPENDED:
        await _track_login(db, user.id, ip_address, user_agent, False, "Account suspended")
        return None, "Account has been suspended. Contact your administrator."

    if user.account_status in (AccountStatus.PENDING_FIRST_LOGIN, AccountStatus.PROFILE_SETUP_REQUIRED):
        await _track_login(db, user.id, ip_address, user_agent, False, "Profile setup required")
        return None, "Complete password and profile setup before face login"

    if user.account_status == AccountStatus.LOCKED:
        if user.locked_at:
            lock_expires = user.locked_at + timedelta(minutes=settings.LOCK_DURATION_MINUTES)
            if datetime.now(timezone.utc) > lock_expires:
                user.account_status = AccountStatus.ACTIVE if not user.is_temp_password else AccountStatus.PENDING_FIRST_LOGIN
                user.failed_login_attempts = 0
                user.locked_at = None
            else:
                remaining = int((lock_expires - datetime.now(timezone.utc)).total_seconds() / 60)
                await _track_login(db, user.id, ip_address, user_agent, False, "Account locked")
                return None, f"Account is locked. Try again in {remaining} minutes."
        else:
            await _track_login(db, user.id, ip_address, user_agent, False, "Account locked")
            return None, "Account is locked. Contact your administrator."

    if not user.face_approved or not user.face_embedding:
        await _track_login(db, user.id, ip_address, user_agent, False, "Face not approved")
        return None, "Face not approved for login"

    try:
        candidate = compute_face_embedding(image_bytes)
    except Exception as e:
        await _track_login(db, user.id, ip_address, user_agent, False, "Face not detected")
        return None, str(e)

    distance = compare_embeddings(user.face_embedding, candidate)
    if distance > settings.FACE_MATCH_THRESHOLD:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.account_status = AccountStatus.LOCKED
            user.locked_at = datetime.now(timezone.utc)
            await _track_login(db, user.id, ip_address, user_agent, False, "Face mismatch — locked")
            await db.flush()
            return None, f"Too many failed attempts. Account locked for {settings.LOCK_DURATION_MINUTES} minutes."
        await _track_login(db, user.id, ip_address, user_agent, False, "Face mismatch")
        remaining = settings.MAX_FAILED_LOGIN_ATTEMPTS - user.failed_login_attempts
        await db.flush()
        return None, f"Face not recognized. {remaining} attempts remaining."

    # Success
    user.failed_login_attempts = 0
    user.locked_at = None
    user.last_login_at = datetime.now(timezone.utc)

    await _track_login(db, user.id, ip_address, user_agent, True, None)
    await db.flush()

    return user, None

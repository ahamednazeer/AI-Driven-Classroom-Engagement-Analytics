"""Jitsi token helper for moderator access."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt

from app.config import settings


def build_jitsi_token(room: str, name: str, email: Optional[str], is_moderator: bool) -> Optional[str]:
    if not settings.JITSI_APP_ID or not settings.JITSI_KID:
        return None

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JITSI_TOKEN_EXP_MINUTES)

    sub = settings.JITSI_APP_ID

    room_claim = settings.JITSI_ROOM_CLAIM or room
    payload = {
        "aud": "jitsi",
        "iss": "chat",
        "sub": sub,
        "room": room_claim,
        "exp": int(exp.timestamp()),
        "nbf": int(now.timestamp()),
        "context": {
            "user": {
                "name": name,
                "email": email,
                "moderator": "true" if is_moderator else "false",
            },
            "room": {
                "regex": bool(settings.JITSI_ROOM_REGEX),
            },
        },
    }

    private_key = settings.JITSI_PRIVATE_KEY
    if not private_key and settings.JITSI_PRIVATE_KEY_PATH:
        try:
            with open(settings.JITSI_PRIVATE_KEY_PATH, "r", encoding="utf-8") as f:
                private_key = f.read()
        except Exception:
            return None
    if not private_key:
        return None
    private_key = private_key.replace("\\n", "\n")
    headers = {"kid": settings.JITSI_KID, "typ": "JWT"}
    return jwt.encode(payload, private_key, algorithm="RS256", headers=headers)

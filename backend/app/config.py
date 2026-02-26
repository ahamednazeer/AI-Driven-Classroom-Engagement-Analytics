"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/classroom_engagement"

    # JWT
    SECRET_KEY: str = "super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Admin seed
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    ADMIN_EMAIL: str = "admin@classroom.local"

    # App
    APP_NAME: str = "AI-Driven Classroom Engagement"
    DEBUG: bool = True
    CORS_ORIGINS: str = "http://localhost:3000"

    # Account security
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    LOCK_DURATION_MINUTES: int = 30

    # File uploads
    UPLOAD_DIR: str = "uploads"
    MAX_FACE_IMAGE_SIZE_MB: int = 5
    FACE_MATCH_THRESHOLD: float = 0.6

    # Engagement signal controls
    ENGAGEMENT_SIGNAL_MIN_INTERVAL_SECONDS: int = 3
    VISION_SIGNAL_MAX_IMAGE_MB: int = 2

    # JaaS (8x8) live classes
    JITSI_DOMAIN: str = "8x8.vc"
    JITSI_APP_ID: str = ""
    JITSI_KID: str = ""
    JITSI_PRIVATE_KEY: str = ""
    JITSI_PRIVATE_KEY_PATH: str = ""
    JITSI_TOKEN_EXP_MINUTES: int = 120
    JITSI_ROOM_CLAIM: str = "*"
    JITSI_ROOM_REGEX: bool = False

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()

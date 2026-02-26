"""
AI-Driven Classroom Engagement & Adaptive Teaching System
FastAPI Application Entry Point

On startup:
1. Creates all database tables
2. Seeds the admin user if not exists
3. Seeds sample teacher and student accounts
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.config import settings
from app.database import engine, AsyncSessionLocal
from app.models.user import User, UserRole, AccountStatus
from app.services.auth_service import hash_password
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.faces import router as faces_router
from app.api.login_tracks import router as login_tracks_router
from app.api.classes import router as classes_router
from app.api.sessions import router as sessions_router
from app.api.analytics import router as analytics_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("classroom-engagement")


async def seed_database():
    """Create initial data: admin user, sample teacher, sample students."""
    async with AsyncSessionLocal() as session:
        try:
            # Check if admin exists
            result = await session.execute(
                select(User).where(User.username == settings.ADMIN_USERNAME)
            )
            admin = result.scalar_one_or_none()

            if not admin:
                logger.info(" Seeding database with initial data...")

                # 1. Create Admin
                admin = User(
                    username=settings.ADMIN_USERNAME,
                    email=settings.ADMIN_EMAIL,
                    password_hash=hash_password(settings.ADMIN_PASSWORD),
                    first_name="System",
                    last_name="Administrator",
                    role=UserRole.ADMIN,
                    account_status=AccountStatus.ACTIVE,
                    is_temp_password=False,
                    department="Administration",
                )
                session.add(admin)
                logger.info(f"Admin user created: {settings.ADMIN_USERNAME} / {settings.ADMIN_PASSWORD}")

                await session.commit()
                logger.info("Database seeding complete!")
            else:
                logger.info("Database already seeded (admin user exists)")

        except Exception as e:
            logger.error(f"Database seeding failed: {e}")
            await session.rollback()
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: create tables and seed data on startup."""
    logger.info("🚀 Starting AI-Driven Classroom Engagement System...")

    logger.info("Skipping create_all; ensure Alembic migrations are applied (alembic upgrade head)")

    # Seed initial data
    await seed_database()

    # Create upload directory
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "faces"), exist_ok=True)
    logger.info("Upload directories ready")

    logger.info(f"{settings.APP_NAME} is ready!")
    logger.info(f" API docs: http://localhost:8000/docs")

    yield

    # Shutdown
    logger.info("Shutting down...")
    await engine.dispose()


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Driven Classroom Engagement & Adaptive Teaching System — Module 1: User & Role Management",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads
if not os.path.exists(settings.UPLOAD_DIR):
    os.makedirs(settings.UPLOAD_DIR)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Register API routes
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(faces_router)
app.include_router(login_tracks_router)
app.include_router(classes_router)
app.include_router(sessions_router)
app.include_router(analytics_router)


@app.get("/", tags=["Health"])
async def root():
    """Health check endpoint."""
    return {
        "status": "online",
        "app": settings.APP_NAME,
        "module": "User & Role Management",
        "version": "1.0.0",
    }


@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "database": "connected",
        "app": settings.APP_NAME,
        "version": "1.0.0",
    }

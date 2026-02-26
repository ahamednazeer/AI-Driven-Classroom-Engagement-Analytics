"""
Analytics API routes for admin dashboard.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.analytics import AdminAnalyticsResponse
from app.services.analytics_service import get_admin_analytics
from app.middleware.rbac import require_admin

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


@router.get("/admin", response_model=AdminAnalyticsResponse)
async def admin_analytics(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    return await get_admin_analytics(db)

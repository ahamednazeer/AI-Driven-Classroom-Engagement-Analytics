"""
Classroom management API routes.

Routes:
    GET    /api/v1/classes                  — List classes (admin/teacher)
    POST   /api/v1/classes                  — Create class (admin)
    GET    /api/v1/classes/{class_id}       — Get class by ID (admin/assigned teacher)
    PUT    /api/v1/classes/{class_id}       — Update class (admin)
    DELETE /api/v1/classes/{class_id}       — Delete class (admin)
    PATCH  /api/v1/classes/{class_id}/teacher — Assign/unassign teacher (admin)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.classroom import (
    ClassroomCreate,
    ClassroomUpdate,
    ClassroomResponse,
    ClassroomListResponse,
    AssignTeacherRequest,
)
from app.services.class_service import (
    create_classroom,
    get_classroom_by_id,
    get_classrooms,
    update_classroom,
    delete_classroom,
    assign_teacher,
)
from app.middleware.rbac import (
    get_current_user,
    require_admin,
)

router = APIRouter(prefix="/api/v1/classes", tags=["Classes"])


@router.get("", response_model=ClassroomListResponse)
async def list_classes(
    department: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List classes. Admins see all; teachers see only their assigned classes."""
    teacher_id = None
    if current_user.role == UserRole.TEACHER:
        teacher_id = current_user.id
    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    classes, total = await get_classrooms(
        db,
        teacher_id=teacher_id,
        department=department,
        section=section,
        batch=batch,
        search=search,
        page=page,
        per_page=per_page,
    )
    return ClassroomListResponse(
        classes=[ClassroomResponse.model_validate(c) for c in classes],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("", response_model=ClassroomResponse, status_code=status.HTTP_201_CREATED)
async def create_class(
    body: ClassroomCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create a class. Admin only."""
    try:
        classroom = await create_classroom(
            db,
            name=body.name,
            department=body.department,
            section=body.section,
            batch=body.batch,
            description=body.description,
            teacher_id=body.teacher_id,
            is_active=body.is_active if body.is_active is not None else True,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    classroom = await get_classroom_by_id(db, classroom.id)
    return ClassroomResponse.model_validate(classroom)


@router.get("/{class_id}", response_model=ClassroomResponse)
async def get_class(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get class by ID. Admin or assigned teacher only."""
    classroom = await get_classroom_by_id(db, class_id)
    if not classroom:
        raise HTTPException(status_code=404, detail="Class not found")

    if current_user.role == UserRole.TEACHER and classroom.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user.role not in (UserRole.ADMIN, UserRole.TEACHER):
        raise HTTPException(status_code=403, detail="Access denied")

    return ClassroomResponse.model_validate(classroom)


@router.put("/{class_id}", response_model=ClassroomResponse)
async def update_class(
    class_id: int,
    body: ClassroomUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update class. Admin only."""
    try:
        classroom = await update_classroom(db, class_id, **body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    classroom = await get_classroom_by_id(db, class_id)
    return ClassroomResponse.model_validate(classroom)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete class. Admin only."""
    try:
        await delete_classroom(db, class_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{class_id}/teacher", response_model=ClassroomResponse)
async def update_class_teacher(
    class_id: int,
    body: AssignTeacherRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Assign or unassign a teacher. Admin only."""
    try:
        classroom = await assign_teacher(db, class_id, body.teacher_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    classroom = await get_classroom_by_id(db, class_id)
    return ClassroomResponse.model_validate(classroom)

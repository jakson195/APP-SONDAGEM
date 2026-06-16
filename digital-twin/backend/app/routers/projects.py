import json
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.geotech import Project
from app.schemas.project import ProjectListResponse, ProjectSummary

router = APIRouter(prefix="/projects", tags=["projects"])


def _project_row_to_summary(row) -> ProjectSummary:
    boundary = json.loads(row.boundary_json) if row.boundary_json else None
    center = json.loads(row.center_json) if row.center_json else None
    return ProjectSummary(
        id=row.id,
        code=row.code,
        name=row.name,
        description=row.description,
        crs_epsg=row.crs_epsg,
        properties=row.properties or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
        boundary=boundary,
        center=center,
    )


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
) -> ProjectListResponse:
    limit = min(max(limit, 1), 500)
    skip = max(skip, 0)

    base = select(
        Project.id,
        Project.code,
        Project.name,
        Project.description,
        Project.crs_epsg,
        Project.properties,
        Project.created_at,
        Project.updated_at,
        func.ST_AsGeoJSON(Project.boundary).label("boundary_json"),
        func.ST_AsGeoJSON(Project.center).label("center_json"),
    ).order_by(Project.name)

    total = await db.scalar(select(func.count()).select_from(Project))
    result = await db.execute(base.offset(skip).limit(limit))
    items = [_project_row_to_summary(r) for r in result.all()]
    return ProjectListResponse(items=items, total=total or 0)


@router.get("/{project_id}", response_model=ProjectSummary)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ProjectSummary:
    from app.utils.deps import get_project_or_404

    await get_project_or_404(db, project_id)
    result = await db.execute(
        select(
            Project.id,
            Project.code,
            Project.name,
            Project.description,
            Project.crs_epsg,
            Project.properties,
            Project.created_at,
            Project.updated_at,
            func.ST_AsGeoJSON(Project.boundary).label("boundary_json"),
            func.ST_AsGeoJSON(Project.center).label("center_json"),
        ).where(Project.id == project_id)
    )
    row = result.one()
    return _project_row_to_summary(row)

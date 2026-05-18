import json
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.geotech import InsarDisplacement
from app.schemas.deformation import (
    DeformationResponse,
    DeformationStats,
    DisplacementPoint,
)
from app.utils.deps import get_project_or_404

router = APIRouter(prefix="/projects/{project_id}/deformations", tags=["deformations"])


@router.get("", response_model=DeformationResponse)
async def get_deformations(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    epoch_from: date | None = Query(None),
    epoch_to: date | None = Query(None),
    insar_image_id: UUID | None = Query(None),
    min_displacement_mm: float | None = Query(None),
    max_displacement_mm: float | None = Query(None),
    limit: int = Query(5000, ge=1, le=50000),
) -> DeformationResponse:
    await get_project_or_404(db, project_id)

    filters = [InsarDisplacement.project_id == project_id]
    if epoch_from:
        filters.append(InsarDisplacement.epoch_date >= epoch_from)
    if epoch_to:
        filters.append(InsarDisplacement.epoch_date <= epoch_to)
    if insar_image_id:
        filters.append(InsarDisplacement.insar_image_id == insar_image_id)
    if min_displacement_mm is not None:
        filters.append(InsarDisplacement.displacement_mm >= min_displacement_mm)
    if max_displacement_mm is not None:
        filters.append(InsarDisplacement.displacement_mm <= max_displacement_mm)

    stats_stmt = select(
        func.count(InsarDisplacement.id),
        func.min(InsarDisplacement.displacement_mm),
        func.max(InsarDisplacement.displacement_mm),
        func.avg(InsarDisplacement.displacement_mm),
    ).where(*filters)
    stats_row = (await db.execute(stats_stmt)).one()
    count, min_mm, max_mm, mean_mm = stats_row

    p95 = None
    if count and count > 0:
        p95_stmt = select(
            func.percentile_cont(0.95).within_group(
                InsarDisplacement.displacement_mm
            )
        ).where(*filters)
        p95 = await db.scalar(p95_stmt)

    rows_stmt = (
        select(
            InsarDisplacement.id,
            InsarDisplacement.project_id,
            InsarDisplacement.insar_image_id,
            InsarDisplacement.terrain_model_id,
            InsarDisplacement.epoch_date,
            InsarDisplacement.displacement_mm,
            InsarDisplacement.velocity_mm_yr,
            InsarDisplacement.coherence,
            InsarDisplacement.los_azimuth_deg,
            InsarDisplacement.los_incidence_deg,
            InsarDisplacement.properties,
            InsarDisplacement.created_at,
            func.ST_AsGeoJSON(InsarDisplacement.geom).label("geom_json"),
        )
        .where(*filters)
        .order_by(InsarDisplacement.epoch_date.desc(), InsarDisplacement.displacement_mm.desc())
        .limit(limit)
    )
    rows = (await db.execute(rows_stmt)).all()

    items = [
        DisplacementPoint(
            id=r.id,
            project_id=r.project_id,
            insar_image_id=r.insar_image_id,
            terrain_model_id=r.terrain_model_id,
            epoch_date=r.epoch_date,
            displacement_mm=r.displacement_mm,
            velocity_mm_yr=r.velocity_mm_yr,
            coherence=r.coherence,
            los_azimuth_deg=r.los_azimuth_deg,
            los_incidence_deg=r.los_incidence_deg,
            geometry=json.loads(r.geom_json),
            properties=r.properties or {},
            created_at=r.created_at,
        )
        for r in rows
    ]

    return DeformationResponse(
        project_id=project_id,
        epoch_from=epoch_from,
        epoch_to=epoch_to,
        stats=DeformationStats(
            count=count or 0,
            min_mm=min_mm,
            max_mm=max_mm,
            mean_mm=float(mean_mm) if mean_mm is not None else None,
            p95_mm=float(p95) if p95 is not None else None,
        ),
        items=items,
    )

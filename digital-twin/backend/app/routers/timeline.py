import json
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.geotech import Alert, AlertStatus, InsarDisplacement, InsarImage
from app.schemas.timeline import TimelineEpoch, TimelineResponse
from app.utils.deps import get_project_or_404

router = APIRouter(prefix="/projects/{project_id}/timeline", tags=["timeline"])


@router.get("", response_model=TimelineResponse)
async def get_timeline(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    epoch_from: date | None = Query(None),
    epoch_to: date | None = Query(None),
) -> TimelineResponse:
    await get_project_or_404(db, project_id)

    disp_filters = [InsarDisplacement.project_id == project_id]
    if epoch_from:
        disp_filters.append(InsarDisplacement.epoch_date >= epoch_from)
    if epoch_to:
        disp_filters.append(InsarDisplacement.epoch_date <= epoch_to)

    disp_agg = (
        select(
            InsarDisplacement.epoch_date,
            func.count(InsarDisplacement.id).label("displacement_count"),
            func.avg(InsarDisplacement.displacement_mm).label("mean_displacement_mm"),
            func.min(InsarDisplacement.displacement_mm).label("min_displacement_mm"),
            func.max(InsarDisplacement.displacement_mm).label("max_displacement_mm"),
        )
        .where(*disp_filters)
        .group_by(InsarDisplacement.epoch_date)
    )
    disp_rows = {r.epoch_date: r for r in (await db.execute(disp_agg)).all()}

    img_filters = [InsarImage.project_id == project_id]
    if epoch_from:
        img_filters.append(InsarImage.acquisition_date >= epoch_from)
    if epoch_to:
        img_filters.append(InsarImage.acquisition_date <= epoch_to)

    img_agg = (
        select(
            InsarImage.acquisition_date,
            func.count(InsarImage.id).label("scene_count"),
        )
        .where(*img_filters)
        .group_by(InsarImage.acquisition_date)
    )
    img_by_date = {r.acquisition_date: r.scene_count for r in (await db.execute(img_agg)).all()}

    alert_stmt = (
        select(
            func.date(Alert.triggered_at).label("day"),
            func.count(Alert.id).label("open_count"),
        )
        .where(
            Alert.project_id == project_id,
            Alert.status == AlertStatus.open,
        )
        .group_by(func.date(Alert.triggered_at))
    )
    if epoch_from:
        alert_stmt = alert_stmt.where(func.date(Alert.triggered_at) >= epoch_from)
    if epoch_to:
        alert_stmt = alert_stmt.where(func.date(Alert.triggered_at) <= epoch_to)
    alerts_by_day = {r.day: r.open_count for r in (await db.execute(alert_stmt)).all()}

    all_dates = sorted(set(disp_rows) | set(img_by_date) | set(alerts_by_day))
    epochs: list[TimelineEpoch] = []
    for d in all_dates:
        dr = disp_rows.get(d)
        epochs.append(
            TimelineEpoch(
                epoch_date=d,
                displacement_count=dr.displacement_count if dr else 0,
                mean_displacement_mm=float(dr.mean_displacement_mm) if dr and dr.mean_displacement_mm else None,
                min_displacement_mm=dr.min_displacement_mm if dr else None,
                max_displacement_mm=dr.max_displacement_mm if dr else None,
                insar_scenes=img_by_date.get(d, 0),
                open_alerts=alerts_by_day.get(d, 0),
            )
        )

    scenes_stmt = (
        select(
            InsarImage.id,
            InsarImage.scene_id,
            InsarImage.satellite,
            InsarImage.acquisition_date,
            func.ST_AsGeoJSON(InsarImage.footprint).label("footprint_json"),
        )
        .where(*img_filters)
        .order_by(InsarImage.acquisition_date)
    )
    insar_acquisitions = []
    for r in (await db.execute(scenes_stmt)).all():
        insar_acquisitions.append(
            {
                "id": str(r.id),
                "scene_id": r.scene_id,
                "satellite": r.satellite,
                "acquisition_date": r.acquisition_date.isoformat(),
                "footprint": json.loads(r.footprint_json) if r.footprint_json else None,
            }
        )

    return TimelineResponse(
        project_id=project_id,
        epochs=epochs,
        insar_acquisitions=insar_acquisitions,
    )

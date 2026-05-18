import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.geotech import (
    MonitoringObservation,
    MonitoringSource,
    PredictionOutput,
    PredictionRun,
    PredictionStatus,
)
from app.schemas.prediction import (
    ObservationOut,
    ObservationsBatchIn,
    PredictionPointOut,
    PredictionRunDetail,
    PredictionRunListResponse,
    PredictionRunOut,
    PredictionRunRequest,
)
from app.services.ml.predict import run_deformation_prediction
from app.utils.deps import get_project_or_404

router = APIRouter(prefix="/projects/{project_id}/predictions", tags=["predictions"])


def _obs_to_out(row: MonitoringObservation) -> ObservationOut:
    return ObservationOut.model_validate(row)


@router.post("/observations", response_model=list[ObservationOut], status_code=201)
async def ingest_observations(
    project_id: UUID,
    body: ObservationsBatchIn,
    db: AsyncSession = Depends(get_db),
) -> list[ObservationOut]:
    await get_project_or_404(db, project_id)
    created: list[MonitoringObservation] = []

    for item in body.items:
        if item.source in ("gnss", "iot") and item.sensor_id is None:
            raise HTTPException(
                status_code=422,
                detail=f"sensor_id obrigatório para fonte {item.source}",
            )
        if item.source == "rain" and item.sensor_id is not None:
            raise HTTPException(status_code=422, detail="chuva não usa sensor_id")

        geom = None
        if item.lon is not None and item.lat is not None:
            geom = WKTElement(f"POINT({item.lon} {item.lat})", srid=4326)

        obs = MonitoringObservation(
            project_id=project_id,
            source=MonitoringSource(item.source),
            sensor_id=item.sensor_id,
            metric=item.metric,
            observed_at=item.observed_at,
            value=item.value,
            geom=geom,
            properties=item.properties,
        )
        db.add(obs)
        created.append(obs)

    await db.commit()
    for o in created:
        await db.refresh(o)
    return [_obs_to_out(o) for o in created]


@router.get("/observations", response_model=list[ObservationOut])
async def list_observations(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    source: MonitoringSource | None = Query(None),
    limit: int = Query(500, le=2000),
) -> list[ObservationOut]:
    await get_project_or_404(db, project_id)
    filters = [MonitoringObservation.project_id == project_id]
    if source:
        filters.append(MonitoringObservation.source == source)
    rows = (
        await db.scalars(
            select(MonitoringObservation)
            .where(*filters)
            .order_by(MonitoringObservation.observed_at.desc())
            .limit(limit)
        )
    ).all()
    return [_obs_to_out(r) for r in rows]


@router.post("/run", response_model=PredictionRunOut, status_code=201)
async def start_prediction(
    project_id: UUID,
    body: PredictionRunRequest,
    db: AsyncSession = Depends(get_db),
) -> PredictionRunOut:
    await get_project_or_404(db, project_id)
    try:
        run = await run_deformation_prediction(
            db, project_id, horizon_days=body.horizon_days
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return PredictionRunOut.model_validate(run)


@router.get("/runs", response_model=PredictionRunListResponse)
async def list_prediction_runs(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, le=100),
) -> PredictionRunListResponse:
    await get_project_or_404(db, project_id)
    total = await db.scalar(
        select(func.count(PredictionRun.id)).where(
            PredictionRun.project_id == project_id
        )
    )
    runs = (
        await db.scalars(
            select(PredictionRun)
            .where(PredictionRun.project_id == project_id)
            .order_by(PredictionRun.created_at.desc())
            .limit(limit)
        )
    ).all()
    return PredictionRunListResponse(
        items=[PredictionRunOut.model_validate(r) for r in runs],
        total=total or 0,
    )


@router.get("/runs/latest", response_model=PredictionRunDetail)
async def get_latest_prediction(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PredictionRunDetail:
    await get_project_or_404(db, project_id)
    run = await db.scalar(
        select(PredictionRun)
        .where(
            PredictionRun.project_id == project_id,
            PredictionRun.status == PredictionStatus.completed,
        )
        .order_by(PredictionRun.created_at.desc())
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Nenhuma previsão concluída")
    return await _run_detail(db, run)


@router.get("/runs/{run_id}", response_model=PredictionRunDetail)
async def get_prediction_run(
    project_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PredictionRunDetail:
    await get_project_or_404(db, project_id)
    run = await db.scalar(
        select(PredictionRun).where(
            PredictionRun.id == run_id,
            PredictionRun.project_id == project_id,
        )
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Execução não encontrada")
    return await _run_detail(db, run)


async def _run_detail(db: AsyncSession, run: PredictionRun) -> PredictionRunDetail:
    rows = (
        await db.execute(
            select(
                PredictionOutput.id,
                PredictionOutput.insar_displacement_id,
                PredictionOutput.forecast_displacement_mm,
                PredictionOutput.rupture_risk,
                PredictionOutput.failure_probability,
                PredictionOutput.confidence,
                PredictionOutput.properties,
                func.ST_AsGeoJSON(PredictionOutput.geom).label("geom_json"),
            ).where(PredictionOutput.run_id == run.id)
        )
    ).all()

    points = [
        PredictionPointOut(
            id=r.id,
            insar_displacement_id=r.insar_displacement_id,
            geometry=json.loads(r.geom_json),
            forecast_displacement_mm=r.forecast_displacement_mm,
            rupture_risk=r.rupture_risk,
            failure_probability=r.failure_probability,
            confidence=r.confidence,
            properties=r.properties or {},
        )
        for r in rows
    ]

    summary = run.summary or {}
    prob_map = _probability_geojson(summary.get("probability_grid", []), points)

    return PredictionRunDetail(
        id=run.id,
        project_id=run.project_id,
        status=run.status,
        horizon_days=run.horizon_days,
        model_version=run.model_version,
        summary=summary,
        error_message=run.error_message,
        created_at=run.created_at,
        completed_at=run.completed_at,
        points=points,
        probability_map=prob_map,
    )


def _probability_geojson(
    grid: list[dict], points: list[PredictionPointOut]
) -> dict:
    features: list[dict] = []

    for cell in grid:
        lon = cell["lon"]
        lat = cell["lat"]
        p = cell["failure_probability"]
        size = 0.004
        ring = [
            [lon - size, lat - size],
            [lon + size, lat - size],
            [lon + size, lat + size],
            [lon - size, lat + size],
            [lon - size, lat - size],
        ]
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "failure_probability": p,
                    "rupture_risk": cell.get("rupture_risk", p),
                    "layer": "probability_grid",
                },
            }
        )

    for pt in points:
        features.append(
            {
                "type": "Feature",
                "geometry": pt.geometry,
                "properties": {
                    "layer": "prediction_point",
                    "forecast_displacement_mm": pt.forecast_displacement_mm,
                    "rupture_risk": pt.rupture_risk,
                    "failure_probability": pt.failure_probability,
                    "confidence": pt.confidence,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


@router.get("/runs/{run_id}/probability-map")
async def get_probability_map_geojson(
    project_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    detail = await get_prediction_run(project_id, run_id, db)
    return detail.probability_map or {"type": "FeatureCollection", "features": []}

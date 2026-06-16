"""Pipeline de previsão de deformação — carrega dados, executa modelo, persiste resultados."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geotech import (
    InsarDisplacement,
    MonitoringObservation,
    MonitoringSource,
    PredictionOutput,
    PredictionRun,
    PredictionStatus,
    Project,
    Sensor,
)
from app.services.ml.features import (
    PointFeatures,
    gnss_velocity,
    iot_anomaly_score,
    rain_totals,
    _days_since_epoch,
)
from app.services.ml.fusion_model import (
    FusionDeformationModel,
    build_probability_grid,
)

logger = logging.getLogger(__name__)


async def _project_bounds(
    db: AsyncSession, project_id: UUID
) -> tuple[float, float, float, float]:
    wkt = await db.scalar(
        select(func.ST_AsText(Project.boundary)).where(Project.id == project_id)
    )
    if wkt:
        row = await db.execute(
            text(
                """
                SELECT
                    ST_XMin(g)::float AS min_lon,
                    ST_YMin(g)::float AS min_lat,
                    ST_XMax(g)::float AS max_lon,
                    ST_YMax(g)::float AS max_lat
                FROM (SELECT ST_Envelope(ST_GeomFromText(:wkt, 4326)) AS g) s
                """
            ),
            {"wkt": wkt},
        )
        r = row.one()
        return r.min_lon, r.min_lat, r.max_lon, r.max_lat

    row = await db.execute(
        text(
            """
            SELECT
                MIN(ST_X(d.geom))::float AS min_lon,
                MIN(ST_Y(d.geom))::float AS min_lat,
                MAX(ST_X(d.geom))::float AS max_lon,
                MAX(ST_Y(d.geom))::float AS max_lat
            FROM geotech.insar_displacement d
            WHERE d.project_id = :pid
            """
        ),
        {"pid": project_id},
    )
    r = row.one()
    if r.min_lon is None:
        return -47.85, -15.85, -47.65, -15.65
    pad = 0.02
    return r.min_lon - pad, r.min_lat - pad, r.max_lon + pad, r.max_lat + pad


async def run_deformation_prediction(
    db: AsyncSession,
    project_id: UUID,
    *,
    horizon_days: int = 30,
) -> PredictionRun:
    run = PredictionRun(
        project_id=project_id,
        status=PredictionStatus.running,
        horizon_days=horizon_days,
        model_version=FusionDeformationModel.version,
    )
    db.add(run)
    await db.flush()

    try:
        ref = datetime.now(UTC)

        rain_rows = (
            await db.execute(
                select(MonitoringObservation.observed_at, MonitoringObservation.value).where(
                    MonitoringObservation.project_id == project_id,
                    MonitoringObservation.source == MonitoringSource.rain,
                )
            )
        ).all()
        rain_obs = [(r.observed_at, r.value) for r in rain_rows]
        rain_7d, rain_30d = rain_totals(rain_obs, ref=ref)

        gnss_obs: list[tuple[datetime, float]] = []
        iot_obs: list[tuple[datetime, float]] = []
        sensor_rows = (
            await db.execute(
                select(
                    MonitoringObservation.observed_at,
                    MonitoringObservation.value,
                    MonitoringObservation.source,
                )
                .join(Sensor, Sensor.id == MonitoringObservation.sensor_id)
                .where(MonitoringObservation.project_id == project_id)
            )
        ).all()
        for row in sensor_rows:
            if row.source == MonitoringSource.gnss:
                gnss_obs.append((row.observed_at, row.value))
            elif row.source == MonitoringSource.iot:
                iot_obs.append((row.observed_at, row.value))

        gnss_vel = gnss_velocity(gnss_obs)
        iot_score = iot_anomaly_score(iot_obs)

        disp_rows = (
            await db.execute(
                select(
                    InsarDisplacement.id,
                    InsarDisplacement.epoch_date,
                    InsarDisplacement.displacement_mm,
                    InsarDisplacement.velocity_mm_yr,
                    InsarDisplacement.coherence,
                    func.ST_X(InsarDisplacement.geom).label("lon"),
                    func.ST_Y(InsarDisplacement.geom).label("lat"),
                ).where(InsarDisplacement.project_id == project_id)
            )
        ).all()

        if not disp_rows:
            raise ValueError("Sem pontos InSAR — importe deslocamentos antes de prever")

        series_by_point: dict[UUID, list[tuple]] = defaultdict(list)
        latest: dict[UUID, object] = {}
        for r in disp_rows:
            series_by_point[r.id].append((r.epoch_date, r.displacement_mm))
            if r.id not in latest or r.epoch_date >= latest[r.id].epoch_date:
                latest[r.id] = r

        model = FusionDeformationModel()
        prob_points: list[tuple[float, float, float]] = []
        outputs: list[PredictionOutput] = []
        max_risk = 0.0
        max_forecast = 0.0

        for disp_id, snap in latest.items():
            epoch0 = min(d for d, _ in series_by_point[disp_id])
            insar_series = [
                (_days_since_epoch(d, epoch0), v) for d, v in sorted(series_by_point[disp_id])
            ]
            feats = PointFeatures(
                displacement_id=disp_id,
                lon=float(snap.lon),
                lat=float(snap.lat),
                displacement_mm=float(snap.displacement_mm),
                velocity_mm_yr=snap.velocity_mm_yr,
                coherence=snap.coherence,
                insar_series=insar_series,
                rain_7d_mm=rain_7d,
                rain_30d_mm=rain_30d,
                gnss_velocity_mm_yr=gnss_vel,
                iot_anomaly=iot_score,
            )
            pred = model.predict_point(feats, horizon_days=horizon_days)
            max_risk = max(max_risk, pred.rupture_risk)
            max_forecast = max(max_forecast, abs(pred.forecast_displacement_mm))

            out = PredictionOutput(
                run_id=run.id,
                insar_displacement_id=disp_id,
                geom=WKTElement(f"POINT({snap.lon} {snap.lat})", srid=4326),
                forecast_displacement_mm=pred.forecast_displacement_mm,
                rupture_risk=pred.rupture_risk,
                failure_probability=pred.failure_probability,
                confidence=pred.confidence,
                properties={
                    "velocity_mm_yr": pred.velocity_mm_yr,
                    "acceleration_mm_yr2": pred.acceleration_mm_yr2,
                    "horizon_days": horizon_days,
                },
            )
            db.add(out)
            outputs.append(out)
            prob_points.append((float(snap.lon), float(snap.lat), pred.failure_probability))

        await db.flush()

        bounds = await _project_bounds(db, project_id)
        grid = build_probability_grid(prob_points, bounds=bounds)

        run.status = PredictionStatus.completed
        run.completed_at = datetime.now(UTC)
        run.summary = {
            "point_count": len(outputs),
            "max_rupture_risk": max_risk,
            "max_forecast_mm": max_forecast,
            "horizon_days": horizon_days,
            "inputs": {
                "insar_points": len(latest),
                "rain_7d_mm": rain_7d,
                "rain_30d_mm": rain_30d,
                "gnss_velocity_mm_yr": gnss_vel,
                "iot_anomaly": iot_score,
            },
            "probability_grid": grid,
        }
        await db.commit()
        await db.refresh(run)
        logger.info("Previsão %s concluída: %s pontos", run.id, len(outputs))
        return run

    except Exception as exc:
        run.status = PredictionStatus.failed
        run.error_message = str(exc)
        run.completed_at = datetime.now(UTC)
        await db.commit()
        logger.exception("Previsão falhou para projeto %s", project_id)
        raise

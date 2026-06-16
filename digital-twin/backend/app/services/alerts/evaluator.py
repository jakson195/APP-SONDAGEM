"""Avaliação de alertas geotécnicos a partir de deslocamentos InSAR."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geotech import (
    Alert,
    AlertNotification,
    AlertRules,
    AlertSeverity,
    AlertStatus,
    CriticalArea,
    InsarDisplacement,
    Project,
)
from app.services.alerts.criteria import (
    AlertThresholds,
    max_severity,
    severity_for_coherence,
    severity_for_displacement,
    severity_for_velocity,
)

logger = logging.getLogger(__name__)


async def get_or_create_rules(db: AsyncSession, project_id: UUID) -> AlertRules:
    rules = await db.scalar(
        select(AlertRules).where(AlertRules.project_id == project_id)
    )
    if rules:
        return rules
    rules = AlertRules(project_id=project_id)
    db.add(rules)
    await db.flush()
    return rules


def _thresholds_from_rules(rules: AlertRules) -> AlertThresholds:
    return AlertThresholds(
        displacement_mm=rules.displacement_mm,
        velocity_mm_yr=rules.velocity_mm_yr,
        coherence_min=rules.coherence_min,
        critical_displacement_mm=rules.critical_displacement_mm,
        critical_velocity_mm_yr=rules.critical_velocity_mm_yr,
    )


async def _open_alert_exists(
    db: AsyncSession,
    project_id: UUID,
    alert_type: str,
    displacement_id: UUID,
) -> bool:
    existing = await db.scalar(
        select(Alert.id).where(
            Alert.project_id == project_id,
            Alert.insar_displacement_id == displacement_id,
            Alert.alert_type == alert_type,
            Alert.status == AlertStatus.open,
        )
    )
    return existing is not None


async def _create_alert(
    db: AsyncSession,
    *,
    project_id: UUID,
    displacement: InsarDisplacement,
    alert_type: str,
    severity: AlertSeverity,
    parameter_name: str,
    measured: float,
    threshold: float,
    message: str,
) -> Alert:
    alert = Alert(
        project_id=project_id,
        insar_displacement_id=displacement.id,
        alert_type=alert_type,
        severity=severity,
        status=AlertStatus.open,
        parameter_name=parameter_name,
        measured_value=measured,
        threshold_value=threshold,
        message=message,
        geom=displacement.geom,
        properties={
            "epoch_date": displacement.epoch_date.isoformat(),
            "auto_generated": True,
        },
    )
    db.add(alert)
    await db.flush()

    notif = AlertNotification(
        project_id=project_id,
        alert_id=alert.id,
        channel="in_app",
        title=f"Alerta {severity.value}: {alert_type}",
        body=message,
    )
    db.add(notif)
    return alert


async def rebuild_critical_areas(db: AsyncSession, project_id: UUID) -> int:
    """Agrega alertas abertos critical/warning em polígonos (buffer + union)."""
    await db.execute(
        text("DELETE FROM geotech.critical_areas WHERE project_id = :pid"),
        {"pid": project_id},
    )

    result = await db.execute(
        text(
            """
            WITH pts AS (
                SELECT
                    a.id AS alert_id,
                    a.severity,
                    a.measured_value,
                    ST_Transform(a.geom, 3857) AS g3857
                FROM geotech.alerts a
                WHERE a.project_id = :pid
                  AND a.status = 'open'
                  AND a.severity IN ('warning', 'critical')
                  AND a.geom IS NOT NULL
            ),
            buffered AS (
                SELECT
                    severity,
                    ST_Buffer(g3857, 120) AS buf,
                    measured_value
                FROM pts
            ),
            clustered AS (
                SELECT
                    severity,
                    ST_Union(buf) AS geom_union,
                    COUNT(*)::int AS cnt,
                    MAX(ABS(measured_value)) AS max_disp
                FROM buffered
                GROUP BY severity
            )
            INSERT INTO geotech.critical_areas (
                project_id, name, severity, geom, alert_count, max_displacement_mm, properties
            )
            SELECT
                :pid,
                'Zona ' || severity || ' #' || ROW_NUMBER() OVER (ORDER BY severity),
                severity::geotech.alert_severity,
                ST_Transform(geom_union, 4326),
                cnt,
                max_disp,
                jsonb_build_object('source', 'auto_cluster')
            FROM clustered
            WHERE geom_union IS NOT NULL
            RETURNING id
            """
        ),
        {"pid": project_id},
    )
    return len(result.fetchall())


async def evaluate_project_alerts(
    db: AsyncSession,
    project_id: UUID,
    *,
    rebuild_areas: bool = True,
    auto_commit: bool = True,
) -> dict:
    """
    Avalia todos os pontos InSAR do projeto e gera alertas + notificações.
    """
    project = await db.scalar(select(Project).where(Project.id == project_id))
    if project is None:
        raise ValueError("Projeto não encontrado")

    rules = await get_or_create_rules(db, project_id)
    if not rules.enabled:
        return {"created": 0, "skipped": 0, "message": "Regras desativadas"}

    thresholds = _thresholds_from_rules(rules)
    displacements = (
        await db.scalars(
            select(InsarDisplacement).where(
                InsarDisplacement.project_id == project_id
            )
        )
    ).all()

    created = 0
    skipped = 0

    for disp in displacements:
        candidates: list[tuple[str, AlertSeverity, str, float, float, str]] = []

        abs_disp = abs(disp.displacement_mm)
        sev_d = severity_for_displacement(abs_disp, thresholds)
        if sev_d:
            candidates.append(
                (
                    "displacement_threshold",
                    sev_d,
                    "displacement_mm",
                    disp.displacement_mm,
                    thresholds.displacement_mm,
                    f"Deslocamento {disp.displacement_mm:.1f} mm (limiar {thresholds.displacement_mm} mm)",
                )
            )

        if disp.velocity_mm_yr is not None:
            abs_v = abs(disp.velocity_mm_yr)
            sev_v = severity_for_velocity(abs_v, thresholds)
            if sev_v:
                candidates.append(
                    (
                        "velocity_threshold",
                        sev_v,
                        "velocity_mm_yr",
                        disp.velocity_mm_yr,
                        thresholds.velocity_mm_yr,
                        f"Velocidade {disp.velocity_mm_yr:.1f} mm/ano (limiar {thresholds.velocity_mm_yr})",
                    )
                )

        sev_c = severity_for_coherence(disp.coherence, thresholds)
        if sev_c:
            candidates.append(
                (
                    "low_coherence",
                    sev_c,
                    "coherence",
                    disp.coherence or 0,
                    thresholds.coherence_min,
                    f"Coerência baixa {disp.coherence:.2f} (< {thresholds.coherence_min})",
                )
            )

        if not candidates:
            continue

        overall = max_severity(*(c[1] for c in candidates)) or AlertSeverity.warning
        primary = next((c for c in candidates if c[1] == overall), candidates[0])

        if await _open_alert_exists(db, project_id, primary[0], disp.id):
            skipped += 1
            continue

        await _create_alert(
            db,
            project_id=project_id,
            displacement=disp,
            alert_type=primary[0],
            severity=overall,
            parameter_name=primary[2],
            measured=primary[3],
            threshold=primary[4],
            message=primary[5],
        )
        created += 1

    areas = 0
    if rebuild_areas:
        areas = await rebuild_critical_areas(db, project_id)
    if auto_commit:
        await db.commit()

    logger.info(
        "Alertas projeto %s: %s criados, %s ignorados, %s áreas",
        project_id,
        created,
        skipped,
        areas,
    )
    return {
        "created": created,
        "skipped": skipped,
        "evaluated": len(displacements),
        "critical_areas": areas,
    }

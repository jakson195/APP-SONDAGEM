import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.geotech import (
    Alert,
    AlertNotification,
    AlertRules,
    AlertSeverity,
    AlertStatus,
    CriticalArea,
    Project,
)
from app.schemas.alert import AlertListResponse, AlertOut
from app.schemas.geotech_alerts import (
    AlertEvaluateResponse,
    AlertRulesOut,
    AlertRulesUpdate,
    AlertStatusUpdate,
    CriticalAreaListResponse,
    CriticalAreaOut,
    CriticalAreasGeoJSON,
    NotificationListResponse,
    NotificationOut,
)
from app.services.alerts.evaluator import (
    evaluate_project_alerts,
    get_or_create_rules,
    rebuild_critical_areas,
)
from app.utils.deps import get_project_or_404

router = APIRouter(tags=["alerts"])


def _alert_row_to_out(row) -> AlertOut:
    geom = json.loads(row.geom_json) if row.geom_json else None
    return AlertOut(
        id=row.id,
        project_id=row.project_id,
        sensor_id=row.sensor_id,
        insar_displacement_id=row.insar_displacement_id,
        alert_type=row.alert_type,
        severity=row.severity,
        status=row.status,
        parameter_name=row.parameter_name,
        measured_value=row.measured_value,
        threshold_value=row.threshold_value,
        message=row.message,
        geometry=geom,
        triggered_at=row.triggered_at,
        resolved_at=row.resolved_at,
        properties=row.properties or {},
        project_code=row.project_code,
        project_name=row.project_name,
    )


def _base_alert_select():
    return select(
        Alert.id,
        Alert.project_id,
        Alert.sensor_id,
        Alert.insar_displacement_id,
        Alert.alert_type,
        Alert.severity,
        Alert.status,
        Alert.parameter_name,
        Alert.measured_value,
        Alert.threshold_value,
        Alert.message,
        Alert.triggered_at,
        Alert.resolved_at,
        Alert.properties,
        func.ST_AsGeoJSON(Alert.geom).label("geom_json"),
        Project.code.label("project_code"),
        Project.name.label("project_name"),
    ).join(Project, Project.id == Alert.project_id)


async def _fetch_alerts(
    db: AsyncSession,
    *,
    filters: list,
    skip: int,
    limit: int,
    triggered_from: datetime | None = None,
    triggered_to: datetime | None = None,
) -> AlertListResponse:
    if triggered_from:
        filters.append(Alert.triggered_at >= triggered_from)
    if triggered_to:
        filters.append(Alert.triggered_at <= triggered_to)

    total = await db.scalar(select(func.count(Alert.id)).where(*filters))
    stmt = (
        _base_alert_select()
        .where(*filters)
        .order_by(Alert.triggered_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [_alert_row_to_out(r) for r in (await db.execute(stmt)).all()]
    return AlertListResponse(items=items, total=total or 0)


@router.get("/projects/{project_id}/alerts", response_model=AlertListResponse)
async def get_project_alerts(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    status: AlertStatus | None = Query(None),
    severity: AlertSeverity | None = Query(None),
    skip: int = 0,
    limit: int = 200,
) -> AlertListResponse:
    await get_project_or_404(db, project_id)
    limit = min(max(limit, 1), 500)
    skip = max(skip, 0)
    filters = [Alert.project_id == project_id]
    if status:
        filters.append(Alert.status == status)
    if severity:
        filters.append(Alert.severity == severity)
    return await _fetch_alerts(db, filters=filters, skip=skip, limit=limit)


@router.get("/projects/{project_id}/alerts/history", response_model=AlertListResponse)
async def get_alert_history(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    status: AlertStatus | None = Query(None),
    severity: AlertSeverity | None = Query(None),
    triggered_from: datetime | None = Query(None),
    triggered_to: datetime | None = Query(None),
    skip: int = 0,
    limit: int = 500,
) -> AlertListResponse:
    """Histórico completo de alertas (inclui resolvidos)."""
    await get_project_or_404(db, project_id)
    limit = min(max(limit, 1), 1000)
    skip = max(skip, 0)
    filters = [Alert.project_id == project_id]
    if status:
        filters.append(Alert.status == status)
    if severity:
        filters.append(Alert.severity == severity)
    return await _fetch_alerts(
        db,
        filters=filters,
        skip=skip,
        limit=limit,
        triggered_from=triggered_from,
        triggered_to=triggered_to,
    )


@router.get("/projects/{project_id}/alerts/rules", response_model=AlertRulesOut)
async def get_alert_rules(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> AlertRulesOut:
    await get_project_or_404(db, project_id)
    rules = await get_or_create_rules(db, project_id)
    await db.commit()
    return AlertRulesOut.model_validate(rules)


@router.put("/projects/{project_id}/alerts/rules", response_model=AlertRulesOut)
async def update_alert_rules(
    project_id: UUID,
    body: AlertRulesUpdate,
    db: AsyncSession = Depends(get_db),
) -> AlertRulesOut:
    await get_project_or_404(db, project_id)
    rules = await get_or_create_rules(db, project_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rules, field, value)
    await db.commit()
    await db.refresh(rules)
    return AlertRulesOut.model_validate(rules)


@router.post(
    "/projects/{project_id}/alerts/evaluate",
    response_model=AlertEvaluateResponse,
)
async def evaluate_alerts(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    rebuild_areas: bool = Query(True),
) -> AlertEvaluateResponse:
    await get_project_or_404(db, project_id)
    try:
        result = await evaluate_project_alerts(
            db, project_id, rebuild_areas=rebuild_areas
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return AlertEvaluateResponse(**result)


@router.post("/projects/{project_id}/critical-areas/rebuild")
async def rebuild_project_critical_areas(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    await get_project_or_404(db, project_id)
    count = await rebuild_critical_areas(db, project_id)
    await db.commit()
    return {"critical_areas": count}


@router.get(
    "/projects/{project_id}/critical-areas",
    response_model=CriticalAreaListResponse,
)
async def list_critical_areas(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CriticalAreaListResponse:
    await get_project_or_404(db, project_id)
    total = await db.scalar(
        select(func.count(CriticalArea.id)).where(CriticalArea.project_id == project_id)
    )
    rows = (
        await db.execute(
            select(
                CriticalArea.id,
                CriticalArea.project_id,
                CriticalArea.name,
                CriticalArea.severity,
                CriticalArea.alert_count,
                CriticalArea.max_displacement_mm,
                CriticalArea.properties,
                CriticalArea.created_at,
                CriticalArea.updated_at,
                func.ST_AsGeoJSON(CriticalArea.geom).label("geom_json"),
            )
            .where(CriticalArea.project_id == project_id)
            .order_by(CriticalArea.severity.desc(), CriticalArea.alert_count.desc())
        )
    ).all()
    items = [
        CriticalAreaOut(
            id=r.id,
            project_id=r.project_id,
            name=r.name,
            severity=r.severity,
            alert_count=r.alert_count,
            max_displacement_mm=r.max_displacement_mm,
            geometry=json.loads(r.geom_json),
            properties=r.properties or {},
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]
    return CriticalAreaListResponse(items=items, total=total or 0)


@router.get(
    "/projects/{project_id}/critical-areas/geojson",
    response_model=CriticalAreasGeoJSON,
)
async def critical_areas_geojson(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CriticalAreasGeoJSON:
    data = await list_critical_areas(project_id, db)
    features = [
        {
            "type": "Feature",
            "id": str(a.id),
            "geometry": a.geometry,
            "properties": {
                "name": a.name,
                "severity": a.severity.value,
                "alert_count": a.alert_count,
                "max_displacement_mm": a.max_displacement_mm,
                **a.properties,
            },
        }
        for a in data.items
    ]
    return CriticalAreasGeoJSON(features=features)


@router.get(
    "/projects/{project_id}/notifications",
    response_model=NotificationListResponse,
)
async def list_notifications(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    unread_only: bool = Query(False),
    skip: int = 0,
    limit: int = 100,
) -> NotificationListResponse:
    await get_project_or_404(db, project_id)
    limit = min(max(limit, 1), 500)
    skip = max(skip, 0)

    base = [AlertNotification.project_id == project_id]
    if unread_only:
        base.append(AlertNotification.read_at.is_(None))

    total = await db.scalar(
        select(func.count(AlertNotification.id)).where(*base)
    )
    unread = await db.scalar(
        select(func.count(AlertNotification.id)).where(
            AlertNotification.project_id == project_id,
            AlertNotification.read_at.is_(None),
        )
    )

    stmt = (
        select(
            AlertNotification,
            Alert.severity.label("alert_severity"),
            Alert.status.label("alert_status"),
        )
        .join(Alert, Alert.id == AlertNotification.alert_id)
        .where(*base)
        .order_by(AlertNotification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items: list[NotificationOut] = []
    for notif, sev, ast in (await db.execute(stmt)).all():
        items.append(
            NotificationOut(
                id=notif.id,
                project_id=notif.project_id,
                alert_id=notif.alert_id,
                channel=notif.channel,
                title=notif.title,
                body=notif.body,
                read_at=notif.read_at,
                created_at=notif.created_at,
                alert_severity=sev,
                alert_status=ast,
            )
        )
    return NotificationListResponse(
        items=items, total=total or 0, unread_count=unread or 0
    )


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> NotificationOut:
    notif = await db.scalar(
        select(AlertNotification).where(AlertNotification.id == notification_id)
    )
    if notif is None:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    notif.read_at = datetime.now(tz=notif.created_at.tzinfo)
    await db.commit()
    alert = await db.scalar(select(Alert).where(Alert.id == notif.alert_id))
    return NotificationOut(
        id=notif.id,
        project_id=notif.project_id,
        alert_id=notif.alert_id,
        channel=notif.channel,
        title=notif.title,
        body=notif.body,
        read_at=notif.read_at,
        created_at=notif.created_at,
        alert_severity=alert.severity if alert else None,
        alert_status=alert.status if alert else None,
    )


@router.post("/projects/{project_id}/notifications/read-all")
async def mark_all_notifications_read(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    await get_project_or_404(db, project_id)
    result = await db.execute(
        update(AlertNotification)
        .where(
            AlertNotification.project_id == project_id,
            AlertNotification.read_at.is_(None),
        )
        .values(read_at=func.now())
    )
    await db.commit()
    return {"marked_read": result.rowcount or 0}


@router.patch("/alerts/{alert_id}", response_model=AlertOut)
async def update_alert_status(
    alert_id: UUID,
    body: AlertStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> AlertOut:
    alert = await db.scalar(select(Alert).where(Alert.id == alert_id))
    if alert is None:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")

    alert.status = body.status
    if body.status == AlertStatus.resolved:
        alert.resolved_at = datetime.now(UTC)
    await db.commit()

    row = (
        await db.execute(_base_alert_select().where(Alert.id == alert_id))
    ).one()
    return _alert_row_to_out(row)


@router.get("/alerts", response_model=AlertListResponse)
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    status: AlertStatus | None = Query(AlertStatus.open),
    severity: AlertSeverity | None = Query(None),
    project_id: UUID | None = Query(None),
    skip: int = 0,
    limit: int = 200,
) -> AlertListResponse:
    limit = min(max(limit, 1), 500)
    skip = max(skip, 0)

    filters: list = []
    if status:
        filters.append(Alert.status == status)
    if severity:
        filters.append(Alert.severity == severity)
    if project_id:
        filters.append(Alert.project_id == project_id)

    count_filters = filters or None
    total_stmt = select(func.count(Alert.id))
    if count_filters:
        total_stmt = total_stmt.where(*count_filters)
    total = await db.scalar(total_stmt)

    stmt = _base_alert_select().order_by(Alert.triggered_at.desc()).offset(skip).limit(limit)
    if count_filters:
        stmt = stmt.where(*count_filters)
    items = [_alert_row_to_out(r) for r in (await db.execute(stmt)).all()]
    return AlertListResponse(items=items, total=total or 0)

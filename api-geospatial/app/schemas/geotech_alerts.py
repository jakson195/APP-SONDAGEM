from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.geotech import AlertSeverity, AlertStatus


class AlertRulesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    displacement_mm: float
    velocity_mm_yr: float
    coherence_min: float
    critical_displacement_mm: float
    critical_velocity_mm_yr: float
    enabled: bool
    updated_at: datetime


class AlertRulesUpdate(BaseModel):
    displacement_mm: float | None = Field(None, gt=0)
    velocity_mm_yr: float | None = Field(None, gt=0)
    coherence_min: float | None = Field(None, ge=0, le=1)
    critical_displacement_mm: float | None = Field(None, gt=0)
    critical_velocity_mm_yr: float | None = Field(None, gt=0)
    enabled: bool | None = None


class AlertStatusUpdate(BaseModel):
    status: AlertStatus


class AlertEvaluateResponse(BaseModel):
    created: int
    skipped: int
    evaluated: int
    critical_areas: int


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    alert_id: UUID
    channel: str
    title: str
    body: str | None = None
    read_at: datetime | None = None
    created_at: datetime
    alert_severity: AlertSeverity | None = None
    alert_status: AlertStatus | None = None


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    total: int
    unread_count: int


class CriticalAreaOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    severity: AlertSeverity
    alert_count: int
    max_displacement_mm: float | None = None
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class CriticalAreaListResponse(BaseModel):
    items: list[CriticalAreaOut]
    total: int


class CriticalAreasGeoJSON(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict[str, Any]]

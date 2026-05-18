from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.geotech import AlertSeverity, AlertStatus


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    sensor_id: UUID | None = None
    insar_displacement_id: UUID | None = None
    alert_type: str
    severity: AlertSeverity
    status: AlertStatus
    parameter_name: str | None = None
    measured_value: float | None = None
    threshold_value: float | None = None
    message: str | None = None
    geometry: dict[str, Any] | None = None
    triggered_at: datetime
    resolved_at: datetime | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    project_code: str | None = None
    project_name: str | None = None


class AlertListResponse(BaseModel):
    items: list[AlertOut]
    total: int

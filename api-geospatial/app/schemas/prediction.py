from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.geotech import MonitoringSource, PredictionStatus


class ObservationIn(BaseModel):
    source: Literal["rain", "gnss", "iot"]
    metric: str
    observed_at: datetime
    value: float
    sensor_id: UUID | None = None
    lon: float | None = None
    lat: float | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class ObservationsBatchIn(BaseModel):
    items: list[ObservationIn]


class ObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    source: MonitoringSource
    sensor_id: UUID | None
    metric: str
    observed_at: datetime
    value: float
    created_at: datetime


class PredictionRunRequest(BaseModel):
    horizon_days: int = Field(30, ge=7, le=365)


class PredictionPointOut(BaseModel):
    id: UUID
    insar_displacement_id: UUID | None
    geometry: dict[str, Any]
    forecast_displacement_mm: float
    rupture_risk: float
    failure_probability: float
    confidence: float
    properties: dict[str, Any] = Field(default_factory=dict)


class PredictionRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    status: PredictionStatus
    horizon_days: int
    model_version: str
    summary: dict[str, Any]
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


class PredictionRunDetail(PredictionRunOut):
    points: list[PredictionPointOut] = Field(default_factory=list)
    probability_map: dict[str, Any] | None = None


class PredictionRunListResponse(BaseModel):
    items: list[PredictionRunOut]
    total: int

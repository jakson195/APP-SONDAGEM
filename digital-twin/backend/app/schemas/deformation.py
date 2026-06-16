from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DisplacementPoint(BaseModel):
    id: UUID
    project_id: UUID
    insar_image_id: UUID
    terrain_model_id: UUID | None = None
    epoch_date: date
    displacement_mm: float
    velocity_mm_yr: float | None = None
    coherence: float | None = None
    los_azimuth_deg: float | None = None
    los_incidence_deg: float | None = None
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DeformationStats(BaseModel):
    count: int
    min_mm: float | None = None
    max_mm: float | None = None
    mean_mm: float | None = None
    p95_mm: float | None = None


class DeformationResponse(BaseModel):
    project_id: UUID
    epoch_from: date | None = None
    epoch_to: date | None = None
    stats: DeformationStats
    items: list[DisplacementPoint]

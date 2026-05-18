from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class TimelineEpoch(BaseModel):
    epoch_date: date
    displacement_count: int = 0
    mean_displacement_mm: float | None = None
    min_displacement_mm: float | None = None
    max_displacement_mm: float | None = None
    insar_scenes: int = 0
    open_alerts: int = 0


class TimelineResponse(BaseModel):
    project_id: UUID
    epochs: list[TimelineEpoch]
    insar_acquisitions: list[dict[str, Any]] = Field(default_factory=list)

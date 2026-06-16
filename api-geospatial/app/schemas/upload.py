from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LidarUploadResponse(BaseModel):
    terrain_model_id: UUID
    project_id: UUID
    name: str
    source_uri: str
    acquisition_date: date | None = None
    resolution_m: float | None = None
    footprint: dict[str, Any] | None = None
    created_at: datetime


class InsarRasterUploadResponse(BaseModel):
    insar_image_id: UUID
    project_id: UUID
    source_uri: str
    acquisition_date: date
    footprint: dict[str, Any]
    scene_id: str | None = None
    satellite: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

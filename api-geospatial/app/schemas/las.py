from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class LasProcessingStatus(BaseModel):
    status: str
    progress: int = 0
    message: str = ""
    tileset_url: str | None = None
    point_count: int | None = None
    updated_at: str | None = None
    completed_at: str | None = None


class LasUploadResponse(BaseModel):
    terrain_model_id: UUID
    project_id: UUID
    name: str
    original_filename: str | None = None
    processing: LasProcessingStatus
    created_at: datetime


class LasStatusResponse(BaseModel):
    terrain_model_id: UUID
    project_id: UUID
    name: str
    model_type: str
    processing: LasProcessingStatus
    tileset_url: str | None = None
    footprint: dict[str, Any] | None = None
    properties: dict[str, Any] = Field(default_factory=dict)

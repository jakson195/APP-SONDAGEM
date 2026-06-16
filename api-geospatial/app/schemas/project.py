from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    description: str | None = None
    crs_epsg: int = 4326
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    boundary: dict[str, Any] | None = None
    center: dict[str, Any] | None = None


class ProjectListResponse(BaseModel):
    items: list[ProjectSummary]
    total: int

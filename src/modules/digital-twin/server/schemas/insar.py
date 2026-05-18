from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class InsarJobCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    date_from: date
    date_to: date
    reference_date: date | None = None
    orbit_direction: str | None = Field(None, pattern="^(ASC|DESC|asc|desc)$")
    aoi_geojson: dict[str, Any] | None = Field(
        None, description="GeoJSON Polygon; default = boundary do projeto"
    )
    run_immediately: bool = True


class InsarJobOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    status: str
    date_from: date
    date_to: date
    reference_date: date | None
    orbit_direction: str | None
    scene_count: int
    error_message: str | None
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    aoi: dict[str, Any] | None = None


class InsarJobListResponse(BaseModel):
    items: list[InsarJobOut]
    total: int


class InsarRasterOut(BaseModel):
    id: UUID
    project_id: UUID
    job_id: UUID
    insar_image_id: UUID | None
    raster_kind: str
    epoch_date: date | None
    file_path: str
    download_url: str
    preview_url: str | None = None
    metadata_url: str
    crs_epsg: int
    pixel_size_m: float | None
    width: int | None
    height: int | None
    units: str
    min_value: float | None
    max_value: float | None
    mean_value: float | None
    footprint: dict[str, Any] | None
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class InsarRasterListResponse(BaseModel):
    items: list[InsarRasterOut]
    total: int


class InsarRasterMetadata(BaseModel):
    id: UUID
    raster_kind: str
    epoch_date: date | None
    crs_epsg: int
    pixel_size_m: float | None
    width: int | None
    height: int | None
    units: str
    nodata_value: float | None
    min_value: float | None
    max_value: float | None
    mean_value: float | None
    footprint: dict[str, Any] | None
    download_url: str
    properties: dict[str, Any] = Field(default_factory=dict)

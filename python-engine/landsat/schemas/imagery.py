from typing import Literal

from pydantic import BaseModel, Field

SpectralMode = Literal["rgb", "grayscale", "false_color", "ndvi"]
DataSource = Literal["planetary_computer", "earth_search", "sentinel_hub", "gee", "inpe"]


class BboxWgs84(BaseModel):
    west: float
    south: float
    east: float
    north: float


class CatalogSearchRequest(BaseModel):
    bbox: BboxWgs84
    date_from: str = Field(..., description="YYYY-MM-DD (ex. 1972-07-23)")
    date_to: str = Field(..., description="YYYY-MM-DD")
    max_cloud_pct: float = 40.0
    limit: int = 80
    satellites: list[str] = Field(
        default_factory=lambda: ["landsat", "sentinel2"],
        description="landsat | sentinel2 | cbers",
    )


class SceneRecord(BaseModel):
    id: str
    collection: str
    provider: str
    satellite: str
    date: str
    cloud_cover_pct: float | None = None
    stac_item_url: str
    platform: str | None = None
    visual_mode: Literal["natural", "grayscale"] = "natural"


class YearSearchRequest(BaseModel):
    bbox: BboxWgs84
    year: int = Field(..., ge=1972, le=2030, description="Ano (ex. 1985)")
    max_cloud_pct: float = 45.0
    limit: int = 30


class CatalogSearchResponse(BaseModel):
    scenes: list[SceneRecord]
    sources: list[DataSource]
    warnings: list[str] = Field(default_factory=list)


class DownloadRequest(BaseModel):
    bbox: BboxWgs84
    scene_id: str | None = None
    stac_item_url: str | None = None
    collection: str | None = None
    date: str | None = None
    spectral_mode: SpectralMode = "rgb"
    max_cloud_pct: float = 50.0


class DownloadResponse(BaseModel):
    ok: bool
    scene_id: str
    date: str
    satellite: str
    geotiff_path: str
    preview_url: str
    bounds: BboxWgs84
    spectral_mode: SpectralMode
    crs: str
    width: int
    height: int
    sources: list[DataSource]


class RenderRequest(BaseModel):
    geotiff_path: str | None = None
    scene_id: str | None = None
    spectral_mode: SpectralMode = "rgb"
    opacity: float = 1.0


class GaruvaExample(BaseModel):
    label: str = "Garuva, SC"
    bbox: BboxWgs84
    date_from: str = "1972-07-23"
    date_to: str = "2026-12-31"

"""Exportação de rasters InSAR para GeoTIFF (rasterio)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds
except ImportError:
    rasterio = None  # type: ignore[assignment]


@dataclass
class GeoTiffProduct:
    path: Path
    width: int
    height: int
    crs_epsg: int
    pixel_size_m: float
    bounds: tuple[float, float, float, float]  # minx, miny, maxx, maxy
    min_value: float
    max_value: float
    mean_value: float
    nodata: float


def _require_rasterio() -> None:
    if rasterio is None:
        raise RuntimeError("rasterio não instalado")


def write_geotiff(
    path: Path,
    data: np.ndarray,
    bounds: tuple[float, float, float, float],
    *,
    crs_epsg: int = 4326,
    nodata: float = -9999.0,
    units: str = "mm",
) -> GeoTiffProduct:
    _require_rasterio()
    path.parent.mkdir(parents=True, exist_ok=True)
    minx, miny, maxx, maxy = bounds
    height, width = data.shape
    transform = from_bounds(minx, miny, maxx, maxy, width, height)
    valid = np.isfinite(data) & (data != nodata)
    if valid.any():
        vmin = float(np.nanmin(data[valid]))
        vmax = float(np.nanmax(data[valid]))
        vmean = float(np.nanmean(data[valid]))
    else:
        vmin = vmax = vmean = 0.0

    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "width": width,
        "height": height,
        "count": 1,
        "crs": CRS.from_epsg(crs_epsg),
        "transform": transform,
        "nodata": nodata,
        "compress": "deflate",
        "predictor": 2,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data.astype(np.float32), 1)
        dst.update_tags(units=units)

    pixel_size = (maxx - minx) / width if width else 0.0
    return GeoTiffProduct(
        path=path,
        width=width,
        height=height,
        crs_epsg=crs_epsg,
        pixel_size_m=pixel_size,
        bounds=bounds,
        min_value=vmin,
        max_value=vmax,
        mean_value=vmean,
        nodata=nodata,
    )


def read_raster_stats(path: Path) -> dict[str, Any]:
    _require_rasterio()
    with rasterio.open(path) as ds:
        band = ds.read(1, masked=True)
        return {
            "width": ds.width,
            "height": ds.height,
            "crs_epsg": ds.crs.to_epsg() if ds.crs else 4326,
            "bounds": ds.bounds,
            "min_value": float(band.min()) if band.count() else None,
            "max_value": float(band.max()) if band.count() else None,
            "mean_value": float(band.mean()) if band.count() else None,
            "nodata": ds.nodata,
        }

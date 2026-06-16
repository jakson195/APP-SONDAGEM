"""Pré-visualização PNG de rasters GeoTIFF para o viewer web."""

from __future__ import annotations

from pathlib import Path

import numpy as np


def geotiff_to_preview_png(tiff_path: Path, png_path: Path) -> None:
    import rasterio
    from PIL import Image

    png_path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(tiff_path) as ds:
        data = ds.read(1, masked=True)
    if np.ma.is_masked(data):
        arr = np.ma.filled(data, np.nan)
    else:
        arr = np.asarray(data, dtype=np.float64)
    valid = np.isfinite(arr)
    if not valid.any():
        arr = np.zeros((64, 64))
    else:
        lo = float(np.nanpercentile(arr[valid], 2))
        hi = float(np.nanpercentile(arr[valid], 98))
        if hi <= lo:
            hi = lo + 1.0
        norm = np.clip((arr - lo) / (hi - lo), 0, 1)
        norm = np.where(valid, norm, 0)
    rgb = (norm * 255).astype(np.uint8)
    Image.fromarray(rgb, mode="L").save(png_path, format="PNG")

"""Download STAC → GeoTIFF (rasterio/GDAL) + índices espectrais."""

from __future__ import annotations

import io
import os
from typing import Any, Literal

import numpy as np

SpectralMode = Literal["rgb", "grayscale", "false_color", "ndvi"]


def _read_window(href: str, bbox_wgs84: dict[str, float]) -> tuple[np.ndarray, dict[str, Any]]:
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.warp import transform_bounds

    west, south, east, north = (
        bbox_wgs84["west"],
        bbox_wgs84["south"],
        bbox_wgs84["east"],
        bbox_wgs84["north"],
    )
    with rasterio.open(href) as src:
        if src.crs and src.crs.to_string() != "EPSG:4326":
            b = transform_bounds("EPSG:4326", src.crs, west, south, east, north)
        else:
            b = (west, south, east, north)
        window = from_bounds(*b, transform=src.transform)
        data = src.read(1, window=window, boundless=True, fill_value=0)
        profile = src.profile.copy()
        profile.update(
            {
                "height": data.shape[0],
                "width": data.shape[1],
                "count": 1,
                "dtype": data.dtype,
            }
        )
        return data.astype(np.float32), profile


def _scale_reflectance(arr: np.ndarray) -> np.ndarray:
    """Landsat C2 SR (0–10000) ou reflectância 0–1 → uint8."""
    a = arr.astype(np.float32)
    if np.nanmax(a) > 2:
        a = a / 10000.0
    a = np.clip(a, 0, 1)
    # stretch tipo Google Earth
    p2, p98 = np.percentile(a[a > 0] if np.any(a > 0) else a, (2, 98))
    if p98 > p2:
        a = (a - p2) / (p98 - p2)
    a = np.clip(a, 0, 1)
    return (np.power(a, 0.92) * 255).astype(np.uint8)


def stack_bands_to_geotiff(
    band_hrefs: dict[str, str | None],
    bbox: dict[str, float],
    out_path: str,
) -> dict[str, Any]:
    import rasterio

    arrays: dict[str, np.ndarray] = {}
    profile = None
    for name, href in band_hrefs.items():
        if not href:
            continue
        data, prof = _read_window(href, bbox)
        arrays[name] = data
        profile = prof

    if profile is None or "red" not in arrays:
        raise ValueError("Bandas insuficientes para composição RGB")

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    profile.update(count=4, dtype=rasterio.uint8, compress="deflate", tiled=True)
    with rasterio.open(out_path, "w", **profile) as dst:
        for i, key in enumerate(["red", "green", "blue", "nir"], start=1):
            if key in arrays:
                dst.write(_scale_reflectance(arrays[key]), i)
    return {
        "path": out_path,
        "width": profile["width"],
        "height": profile["height"],
        "crs": str(profile.get("crs", "EPSG:4326")),
    }


def render_geotiff_to_png(
    geotiff_path: str,
    mode: SpectralMode = "rgb",
) -> bytes:
    import rasterio
    from PIL import Image

    with rasterio.open(geotiff_path) as ds:
        red = ds.read(1).astype(np.float32)
        green = ds.read(2).astype(np.float32) if ds.count >= 2 else red
        blue = ds.read(3).astype(np.float32) if ds.count >= 3 else red
        nir = ds.read(4).astype(np.float32) if ds.count >= 4 else red

    if mode == "ndvi":
        denom = nir + red
        ndvi = np.where(denom != 0, (nir - red) / denom, 0)
        img = np.zeros((*ndvi.shape, 3), dtype=np.uint8)
        img[..., 0] = np.clip((1 - ndvi) * 180, 0, 255)
        img[..., 1] = np.clip((ndvi + 0.2) * 200, 0, 255)
        img[..., 2] = np.clip(ndvi * 120, 0, 255)
    elif mode == "false_color":
        r, g, b = _scale_reflectance(nir), _scale_reflectance(red), _scale_reflectance(green)
        img = np.stack([r, g, b], axis=-1)
    elif mode == "grayscale":
        g = 0.299 * red + 0.587 * green + 0.114 * blue
        u = _scale_reflectance(g)
        img = np.stack([u, u, u], axis=-1)
    else:
        r, g, b = _scale_reflectance(red), _scale_reflectance(green), _scale_reflectance(blue)
        img = np.stack([r, g, b], axis=-1)

    pil = Image.fromarray(img.astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    pil.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def download_scene_geotiff(
    item,
    bbox: dict[str, float],
    scene_id: str,
    bands: dict[str, str | None],
) -> tuple[str, dict[str, Any]]:
    from services.stac_client import data_dir  # noqa: PLC0415

    out_dir = os.path.join(data_dir(), "geotiff")
    os.makedirs(out_dir, exist_ok=True)
    safe_id = scene_id.replace("/", "_").replace(":", "_")
    out_path = os.path.join(out_dir, f"{safe_id}.tif")
    meta = stack_bands_to_geotiff(bands, bbox, out_path)
    return out_path, meta


def auto_spectral_mode(date: str, requested: SpectralMode) -> SpectralMode:
    if requested != "rgb":
        return requested
    try:
        year = int(date[:4])
    except ValueError:
        return requested
    return "grayscale" if year < 1999 else "rgb"

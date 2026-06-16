"""Leitura e escrita GeoTIFF com reprojeção."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.warp import reproject, transform_bounds


def read_rgb_downsampled(
    path: Path,
    max_side: int,
) -> tuple[np.ndarray, Affine, rasterio.crs.CRS, int, int]:
    with rasterio.open(path) as src:
        scale = min(1.0, max_side / max(src.height, src.width))
        out_h = max(1, int(round(src.height * scale)))
        out_w = max(1, int(round(src.width * scale)))
        transform = src.transform * Affine.scale(src.width / out_w, src.height / out_h)
        crs = src.crs
        count = min(3, src.count)
        if count == 1:
            band = src.read(
                1,
                out_shape=(out_h, out_w),
                resampling=Resampling.bilinear,
            ).astype(np.float32)
            stack = np.repeat(band[:, :, np.newaxis], 3, axis=2)
        else:
            data = src.read(
                list(range(1, count + 1)),
                out_shape=(count, out_h, out_w),
                resampling=Resampling.bilinear,
            ).astype(np.float32)
            stack = np.moveaxis(data, 0, -1)
            if stack.shape[2] < 3:
                stack = np.repeat(stack, 3, axis=2)[:, :, :3]
    return stack, transform, crs, out_h, out_w


def reproject_to_reference(
    path: Path,
    ref_transform: Affine,
    ref_crs: rasterio.crs.CRS,
    out_h: int,
    out_w: int,
    bands: int = 1,
) -> np.ndarray:
    out = np.zeros((out_h, out_w), dtype=np.float32) if bands == 1 else np.zeros((out_h, out_w, bands), dtype=np.float32)
    with rasterio.open(path) as src:
        if bands == 1:
            reproject(
                source=rasterio.band(src, 1),
                destination=out,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=ref_transform,
                dst_crs=ref_crs,
                resampling=Resampling.bilinear,
            )
        else:
            for b in range(bands):
                src_band = min(b + 1, src.count)
                reproject(
                    source=rasterio.band(src, src_band),
                    destination=out[:, :, b],
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=ref_transform,
                    dst_crs=ref_crs,
                    resampling=Resampling.bilinear,
                )
    return out


def read_pair_rgb(
    t0_path: Path,
    t1_path: Path,
    max_side: int,
) -> tuple[np.ndarray, np.ndarray, Affine, rasterio.crs.CRS]:
    t0, transform, crs, h, w = read_rgb_downsampled(t0_path, max_side)
    t1 = np.zeros((h, w, 3), dtype=np.float32)
    with rasterio.open(t1_path) as t1_src:
        for band_idx in range(3):
            src_band = min(band_idx + 1, t1_src.count)
            reproject(
                source=rasterio.band(t1_src, src_band),
                destination=t1[:, :, band_idx],
                src_transform=t1_src.transform,
                src_crs=t1_src.crs,
                dst_transform=transform,
                dst_crs=crs,
                resampling=Resampling.bilinear,
            )
    return t0, t1, transform, crs


def bounds_wgs84(transform: Affine, crs: rasterio.crs.CRS, h: int, w: int) -> list[float]:
    bounds = rasterio.transform.array_bounds(h, w, transform)
    west, south, east, north = transform_bounds(crs, "EPSG:4326", *bounds)
    return [west, south, east, north]


def write_geotiff(path: Path, data: np.ndarray, transform: Affine, crs: rasterio.crs.CRS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if data.ndim == 2:
        h, w = data.shape
        count = 1
    else:
        h, w = data.shape[:2]
        count = data.shape[2]
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=count,
        dtype=data.dtype,
        crs=crs,
        transform=transform,
        compress="deflate",
    ) as dst:
        if count == 1:
            dst.write(data, 1)
        else:
            for i in range(count):
                dst.write(data[:, :, i], i + 1)


def normalize_rgb(stack: np.ndarray) -> np.ndarray:
    out = stack.copy()
    for c in range(3):
        ch = out[:, :, c]
        mask = ch > 0
        if np.any(mask):
            p2, p98 = np.percentile(ch[mask], (2, 98))
        else:
            p2, p98 = 0.0, 1.0
        if p98 <= p2:
            p98 = p2 + 1.0
        out[:, :, c] = np.clip((ch - p2) / (p98 - p2), 0, 1)
    return out

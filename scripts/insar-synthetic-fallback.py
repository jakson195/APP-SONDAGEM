#!/usr/bin/env python3
"""
Gera GeoTIFF sintéticos no mesmo diretório de trabalho do pipeline Node (sem SNAP).
Entrada: job_context.json com aoi_wkt, reference_date opcional, lista scenes com acquisition_date.

Dependências: numpy, rasterio, shapely.

Uso: python insar-synthetic-fallback.py <work_dir>
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

try:
    import numpy as np
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds
    from shapely import wkt as shapely_wkt
except ImportError as exc:
    raise SystemExit(
        "Instale numpy, rasterio e shapely (ex.: pip install numpy rasterio shapely)"
    ) from exc


@dataclass
class Scene:
    scene_id: str
    acquisition_date: date


def parse_scenes(raw: list[dict]) -> list[Scene]:
    out: list[Scene] = []
    for item in raw:
        d = item["acquisition_date"]
        if isinstance(d, str):
            acq = date.fromisoformat(d[:10])
        else:
            acq = date.today()
        out.append(Scene(scene_id=str(item.get("scene_id", "")), acquisition_date=acq))
    return out


def bbox_from_wkt(aoi_wkt: str) -> tuple[float, float, float, float]:
    geom = shapely_wkt.loads(aoi_wkt)
    return geom.bounds  # minx, miny, maxx, maxy


def grid_shape(bounds: tuple[float, float, float, float], resolution_deg: float) -> tuple[int, int]:
    minx, miny, maxx, maxy = bounds
    width = max(32, int((maxx - minx) / resolution_deg))
    height = max(32, int((maxy - miny) / resolution_deg))
    return width, height


def write_geotiff(
    path: Path,
    data: np.ndarray,
    bounds: tuple[float, float, float, float],
    *,
    crs_epsg: int = 4326,
    nodata: float = -9999.0,
    units: str = "mm",
) -> None:
    minx, miny, maxx, maxy = bounds
    height, width = data.shape
    transform = from_bounds(minx, miny, maxx, maxy, width, height)
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


def synthetic_stack(
    bounds: tuple[float, float, float, float],
    scenes: list[Scene],
    reference_date: date | None,
    resolution_deg: float = 0.002,
) -> list[tuple[date, np.ndarray]]:
    minx, miny, maxx, maxy = bounds
    w, h = grid_shape(bounds, resolution_deg)
    lon = np.linspace(minx, maxx, w)
    lat = np.linspace(miny, maxy, h)
    lon_g, lat_g = np.meshgrid(lon, lat)
    ref = reference_date or scenes[0].acquisition_date

    stack: list[tuple[date, np.ndarray]] = []
    for i, scene in enumerate(scenes):
        days = (scene.acquisition_date - ref).days
        trend = days * 0.15
        spatial = 8.0 * np.sin(lon_g * 80) * np.cos(lat_g * 80)
        rng = np.random.default_rng(abs(hash(scene.scene_id)) % (2**32))
        noise = rng.normal(0, 1.5, lon_g.shape)
        disp = trend + spatial + noise
        stack.append((scene.acquisition_date, disp.astype(np.float32)))
    return stack


def velocity_from_stack(stack: list[tuple[date, np.ndarray]]) -> np.ndarray:
    if len(stack) < 2:
        return np.zeros_like(stack[0][1])
    t0 = stack[0][0]
    t1 = stack[-1][0]
    dt_yr = max((t1 - t0).days / 365.25, 1 / 365.25)
    d0 = stack[0][1]
    d1 = stack[-1][1]
    return ((d1 - d0) / dt_yr).astype(np.float32)


def coherence_map(shape: tuple[int, int], n: int) -> np.ndarray:
    rng = np.random.default_rng(n * 17)
    base = 0.55 + 0.35 * rng.random(shape)
    return np.clip(base, 0.0, 1.0).astype(np.float32)


def main() -> None:
    work = Path(sys.argv[1])
    ctx_path = work / "job_context.json"
    ctx = json.loads(ctx_path.read_text(encoding="utf-8"))
    aoi_wkt = ctx["aoi_wkt"]
    scenes = parse_scenes(ctx["scenes"])
    ref_raw = ctx.get("reference_date")
    ref = (
        datetime.fromisoformat(str(ref_raw).replace("Z", "+00:00")).date()
        if ref_raw
        else None
    )

    bounds = bbox_from_wkt(aoi_wkt)
    stack = synthetic_stack(bounds, scenes, ref)

    # Produtos auxiliares do fluxo InSAR (sintéticos)
    if stack:
        h, w = stack[0][1].shape
        wrapped = np.angle(
            np.exp(1j * (stack[-1][1] / 12.0) * math.pi)
        ).astype(np.float32)
        write_geotiff(work / "wrapped_phase.tif", wrapped, bounds, units="rad")
        unwrapped = (stack[-1][1] * 0.08).astype(np.float32)
        write_geotiff(work / "unwrapped_phase.tif", unwrapped, units="rad")
        ifg = (stack[-1][1] - stack[0][1]).astype(np.float32)
        write_geotiff(work / "interferogram.tif", ifg, units="mm")

    for epoch, arr in stack:
        write_geotiff(
            work / f"displacement_{epoch.isoformat()}.tif",
            arr,
            bounds,
            units="mm",
        )

    vel = velocity_from_stack(stack)
    write_geotiff(work / "velocity.tif", vel, bounds, units="mm/yr")

    coh = coherence_map((stack[0][1].shape[0], stack[0][1].shape[1]), len(scenes))
    write_geotiff(work / "coherence.tif", coh, bounds, units="1")


if __name__ == "__main__":
    main()

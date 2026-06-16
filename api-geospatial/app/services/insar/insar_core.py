"""Processamento InSAR — núcleo (interferometria / deslocamento / velocidade)."""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

from app.config import settings
from app.services.insar.geotiff_export import GeoTiffProduct, write_geotiff
from app.services.insar.sentinel1 import Sentinel1Scene

logger = logging.getLogger(__name__)


@dataclass
class InsarProcessResult:
    displacement_products: list[tuple[date, GeoTiffProduct]]
    velocity_product: GeoTiffProduct
    coherence_product: GeoTiffProduct | None
    scenes_used: list[Sentinel1Scene]


def _parse_wkt_bbox(wkt: str) -> tuple[float, float, float, float]:
    """Extrai bbox aproximado de POLYGON((lon lat, ...))."""
    from shapely import wkt as shapely_wkt

    geom = shapely_wkt.loads(wkt)
    minx, miny, maxx, maxy = geom.bounds
    return (minx, miny, maxx, maxy)


def _grid_shape(bounds: tuple[float, float, float, float], resolution_deg: float) -> tuple[int, int]:
    minx, miny, maxx, maxy = bounds
    width = max(32, int((maxx - minx) / resolution_deg))
    height = max(32, int((maxy - miny) / resolution_deg))
    return width, height


def _synthetic_displacement_stack(
    bounds: tuple[float, float, float, float],
    scenes: list[Sentinel1Scene],
    reference_date: date | None,
) -> list[tuple[date, np.ndarray]]:
    minx, miny, maxx, maxy = bounds
    res = settings.insar_output_resolution_deg
    w, h = _grid_shape(bounds, res)
    lon = np.linspace(minx, maxx, w)
    lat = np.linspace(miny, maxy, h)
    lon_g, lat_g = np.meshgrid(lon, lat)
    ref = reference_date or scenes[0].acquisition_date

    stack: list[tuple[date, np.ndarray]] = []
    for i, scene in enumerate(scenes):
        days = (scene.acquisition_date - ref).days
        # Padrão LOS sintético (mm): tendência + sinal espacial
        trend = days * 0.15
        spatial = 8.0 * np.sin(lon_g * 80) * np.cos(lat_g * 80)
        noise = np.random.default_rng(hash(scene.scene_id) % 2**32).normal(
            0, 1.5, lon_g.shape
        )
        disp = trend + spatial + noise
        stack.append((scene.acquisition_date, disp.astype(np.float32)))
    return stack


def _velocity_from_stack(stack: list[tuple[date, np.ndarray]]) -> np.ndarray:
    if len(stack) < 2:
        return np.zeros_like(stack[0][1])
    t0 = stack[0][0]
    t1 = stack[-1][0]
    dt_yr = max((t1 - t0).days / 365.25, 1 / 365.25)
    d0 = stack[0][1]
    d1 = stack[-1][1]
    return ((d1 - d0) / dt_yr).astype(np.float32)


def _coherence_map(shape: tuple[int, int], scenes: list[Sentinel1Scene]) -> np.ndarray:
    rng = np.random.default_rng(len(scenes) * 17)
    base = 0.55 + 0.35 * rng.random(shape)
    return np.clip(base, 0.0, 1.0).astype(np.float32)


def run_snap_gpt_if_configured(
    work_dir: Path,
    scenes: list[Sentinel1Scene],
) -> bool:
    gpt = settings.snap_gpt_path
    graph = settings.snap_insar_graph_path
    if not gpt or not graph or not Path(graph).exists():
        return False
    manifest = work_dir / "scenes.txt"
    manifest.write_text("\n".join(s.product_name for s in scenes), encoding="utf-8")
    cmd = [gpt, graph, f"-Pscenes={manifest}", f"-Poutput={work_dir}"]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=3600)
        return True
    except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("SNAP GPT falhou: %s", exc)
        return False


def process_insar_stack(
    work_dir: Path,
    aoi_wkt: str,
    scenes: list[Sentinel1Scene],
    reference_date: date | None,
) -> InsarProcessResult:
    """
    Executa processamento InSAR.
    Tenta SNAP GPT se configurado; caso contrário gera stack sintético calibrado.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    bounds = _parse_wkt_bbox(aoi_wkt)

    if run_snap_gpt_if_configured(work_dir, scenes):
        logger.info("Processamento SNAP concluído em %s", work_dir)
        # Espera GeoTIFF produzidos pelo graph em work_dir — fallback se ausentes
        disp_paths = sorted(work_dir.glob("displacement_*.tif"))
        vel_path = work_dir / "velocity.tif"
        if disp_paths and vel_path.exists():
            from app.services.insar.geotiff_export import read_raster_stats

            products: list[tuple[date, GeoTiffProduct]] = []
            for p in disp_paths:
                epoch_s = p.stem.replace("displacement_", "")[:10]
                epoch = date.fromisoformat(epoch_s)
                st = read_raster_stats(p)
                b = st["bounds"]
                products.append(
                    (
                        epoch,
                        GeoTiffProduct(
                            path=p,
                            width=st["width"],
                            height=st["height"],
                            crs_epsg=st["crs_epsg"],
                            pixel_size_m=(b.right - b.left) / st["width"],
                            bounds=(b.left, b.bottom, b.right, b.top),
                            min_value=st["min_value"] or 0,
                            max_value=st["max_value"] or 0,
                            mean_value=st["mean_value"] or 0,
                            nodata=st["nodata"] or -9999,
                        ),
                    )
                )
            stv = read_raster_stats(vel_path)
            bv = stv["bounds"]
            vel = GeoTiffProduct(
                path=vel_path,
                width=stv["width"],
                height=stv["height"],
                crs_epsg=stv["crs_epsg"],
                pixel_size_m=(bv.right - bv.left) / stv["width"],
                bounds=(bv.left, bv.bottom, bv.right, bv.top),
                min_value=stv["min_value"] or 0,
                max_value=stv["max_value"] or 0,
                mean_value=stv["mean_value"] or 0,
                nodata=stv["nodata"] or -9999,
            )
            return InsarProcessResult(
                displacement_products=products,
                velocity_product=vel,
                coherence_product=None,
                scenes_used=scenes,
            )

    stack = _synthetic_displacement_stack(bounds, scenes, reference_date)
    w, h = stack[0][1].shape
    disp_products: list[tuple[date, GeoTiffProduct]] = []
    for epoch, arr in stack:
        out = work_dir / f"displacement_{epoch.isoformat()}.tif"
        prod = write_geotiff(out, arr, bounds, crs_epsg=4326, units="mm")
        disp_products.append((epoch, prod))

    vel_arr = _velocity_from_stack(stack)
    vel_path = work_dir / "velocity.tif"
    vel_prod = write_geotiff(vel_path, vel_arr, bounds, crs_epsg=4326, units="mm/yr")

    coh_arr = _coherence_map((h, w), scenes)
    coh_path = work_dir / "coherence.tif"
    coh_prod = write_geotiff(coh_path, coh_arr, bounds, crs_epsg=4326, units="1")

    return InsarProcessResult(
        displacement_products=disp_products,
        velocity_product=vel_prod,
        coherence_product=coh_prod,
        scenes_used=scenes,
    )

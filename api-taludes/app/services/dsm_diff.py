"""Diferença de DSM entre épocas."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from app.services.raster_io import reproject_to_reference, write_geotiff


def compute_dsm_difference(
    dsm_t0: Path,
    dsm_t1: Path,
    ref_transform,
    ref_crs,
    out_h: int,
    out_w: int,
    out_path: Path,
) -> np.ndarray:
    z0 = reproject_to_reference(dsm_t0, ref_transform, ref_crs, out_h, out_w, bands=1)
    z1 = reproject_to_reference(dsm_t1, ref_transform, ref_crs, out_h, out_w, bands=1)
    diff = (z1 - z0).astype(np.float32)
    np.nan_to_num(diff, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    write_geotiff(out_path, diff, ref_transform, ref_crs)
    return diff

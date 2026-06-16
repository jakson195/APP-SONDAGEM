"""Pós-processamento ResIPy: clamp ρ, crop corners, contour smooth."""

from __future__ import annotations

import numpy as np
from scipy.interpolate import griddata
from scipy.ndimage import gaussian_filter

from api_schemas import Invert2DResponse, InvertParamsIn
from array_utils import writable


def clamp_m_log10(
    m: np.ndarray,
    rho_min: float,
    rho_max: float,
) -> np.ndarray:
    lo = max(float(rho_min), 1e-6)
    hi = max(float(rho_max), lo * 1.01)
    m_min = float(np.log10(lo))
    m_max = float(np.log10(hi))
    out = writable(m)
    finite = np.isfinite(out)
    out[finite] = np.clip(out[finite], m_min, m_max)
    return out


def apply_coverage_mask(
    m_log10: np.ndarray,
    nx: int,
    nz: int,
    z_cover_m: list[float],
    z_edges: list[float],
) -> tuple[np.ndarray, list[bool]]:
    """Crop corners — células abaixo da profundidade de cobertura ficam inactivas."""
    m = writable(m_log10)
    active = [True] * (nx * nz)
    if not z_cover_m or len(z_edges) < 2:
        return m, active

    z_centers = 0.5 * (np.array(z_edges[:-1]) + np.array(z_edges[1:]))
    dx = (z_edges[-1] - z_edges[0]) / max(nx, 1) if len(z_edges) > 1 else 1.0
    x0 = 0.0  # relative columns

    for i in range(nx):
        z_lim = z_cover_m[min(i, len(z_cover_m) - 1)] if z_cover_m else z_edges[-1]
        for j in range(nz):
            u = i * nz + j
            if z_centers[j] > z_lim:
                active[u] = False
                m[u] = np.nan

    fill = float(np.nanmean(m[np.isfinite(m)])) if np.any(np.isfinite(m)) else 2.0
    m = np.nan_to_num(m, nan=fill)
    return m, active


def smooth_model_contour(
    m_log10: np.ndarray,
    nx: int,
    nz: int,
    sigma: float = 0.8,
    passes: int = 1,
) -> np.ndarray:
    """Suavização gaussiana + griddata para aparência contínua (ResIPy-like)."""
    if passes < 1 or sigma <= 0:
        return writable(m_log10)

    grid = writable(m_log10).reshape(nx, nz)
    for _ in range(passes):
        grid = writable(gaussian_filter(grid, sigma=sigma, mode="nearest"))

    xs = np.arange(nx, dtype=float)
    zs = np.arange(nz, dtype=float)
    xx, zz = np.meshgrid(xs, zs, indexing="ij")
    pts = np.c_[xx.ravel(), zz.ravel()]
    vals = writable(grid.ravel())
    fine_x = np.linspace(0, nx - 1, nx * 2)
    fine_z = np.linspace(0, nz - 1, nz * 2)
    fxx, fzz = np.meshgrid(fine_x, fine_z, indexing="ij")
    fine_pts = np.c_[fxx.ravel(), fzz.ravel()]
    try:
        interp = griddata(
            pts, vals, fine_pts, method="linear", fill_value=np.nanmean(vals)
        )
    except Exception:
        interp = vals
    out = griddata(
        fine_pts,
        writable(interp),
        pts,
        method="nearest",
        fill_value=np.nanmean(vals),
    )
    return writable(out).ravel()


def postprocess_invert_response(
    out: Invert2DResponse,
    params: InvertParamsIn,
) -> Invert2DResponse:
    m = writable(out.m_log10)
    m = clamp_m_log10(m, params.rho_min_ohm_m, params.rho_max_ohm_m)

    active = list(out.active_cells) if out.active_cells else [True] * m.size
    if params.crop_corners and out.z_cover_m:
        m, active = apply_coverage_mask(
            m, out.nx, out.nz, out.z_cover_m, out.z_edges_m
        )

    if params.contour_smooth_passes > 0:
        m = smooth_model_contour(
            m,
            out.nx,
            out.nz,
            sigma=params.contour_smooth_sigma,
            passes=params.contour_smooth_passes,
        )
        m = clamp_m_log10(m, params.rho_min_ohm_m, params.rho_max_ohm_m)

    data = out.model_dump()
    data["m_log10"] = m.tolist()
    data["active_cells"] = active
    tags: list[str] = ["clamp"]
    if params.crop_corners and out.z_cover_m:
        tags.append("crop")
    if params.contour_smooth_passes > 0:
        tags.append("contour")
    data["message"] = (out.message or "") + f" [post: {'+'.join(tags)}]"
    return Invert2DResponse(**data)

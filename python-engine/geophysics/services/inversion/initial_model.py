"""Modelo inicial 1D por profundidade pseudo (quebra simetria lateral)."""

from __future__ import annotations

import numpy as np

from .mesh import Mesh2D, idx
from .model_units import LN10, clip_m_ln, log10_rho_to_m_ln


def seed_model_from_pseudodepth(
    m: np.ndarray,
    mesh: Mesh2D,
    reading_dicts: list[dict],
    y_obs_log10: np.ndarray,
    factor_depth: float,
) -> np.ndarray:
    """Distribui ln(ρ) por coluna/profundidade a partir de log₁₀(ρa) observada."""
    nx, nz = mesh.nx, mesh.nz
    sums = np.zeros_like(m)
    counts = np.zeros_like(m)
    for k, r in enumerate(reading_dicts):
        station = float(r["station_m"])
        n = max(1, int(r["n"]))
        a = max(float(r["a_m"]), 0.5)
        z_cover = factor_depth * n * a
        m_ln = float(y_obs_log10[k]) * LN10
        i = int(
            np.clip(
                np.searchsorted(mesh.x_centers, station, side="left"),
                0,
                nx - 1,
            )
        )
        if mesh.x_centers[i] > station and i > 0:
            i -= 1
        half = max(n * a * 0.55, (mesh.x_centers[1] - mesh.x_centers[0]) * 0.5 if nx > 1 else a)
        for ii in range(nx):
            if abs(mesh.x_centers[ii] - station) > half + (mesh.x1 - mesh.x0) / nx:
                continue
            for j in range(nz):
                if not mesh.active[ii, j]:
                    continue
                zc = float(mesh.z_centers[j])
                if zc > z_cover * 1.2:
                    continue
                u = idx(ii, j, nz)
                w = 1.0 / (1.0 + zc / max(z_cover, 0.5))
                sums[u] += m_ln * w
                counts[u] += w
    for u in range(m.size):
        if counts[u] > 0:
            m[u] = sums[u] / counts[u]
    return m


def build_initial_model_ln(
    y_obs_log10: np.ndarray,
    nm: int,
    mesh: Mesh2D | None = None,
    reading_dicts: list[dict] | None = None,
    factor_depth: float = 0.286,
) -> np.ndarray:
    base = log10_rho_to_m_ln(float(np.median(y_obs_log10)))
    m = np.full(nm, base, dtype=float)
    if mesh is not None and reading_dicts:
        m = seed_model_from_pseudodepth(m, mesh, reading_dicts, y_obs_log10, factor_depth)
    return clip_m_ln(m)

"""Profundidade máxima por coluna a partir da geometria dipolo-dipolo (sem extrapolação)."""

from __future__ import annotations

import numpy as np

from .mesh import Mesh2D


def column_sensitivity_depth_m(
    mesh: Mesh2D,
    readings: list[dict],
    factor_depth: float,
) -> np.ndarray:
    """
    Para cada coluna x, profundidade máxima com dados (n·a·factor_depth).
    Sem ganho artificial nem interpolação entre colunas.
    """
    nx = mesh.nx
    z_cover = np.zeros(nx, dtype=float)
    dx = (mesh.x1 - mesh.x0) / max(nx, 1)

    for i in range(nx):
        xc = float(mesh.x_centers[i])
        z_max_col = 0.0
        for r in readings:
            n = int(r["n"])
            a = float(r["a_m"])
            xm = float(r["station_m"])
            zd = factor_depth * n * a
            half = n * a * 0.5
            if abs(xm - xc) <= half + dx * 0.5:
                z_max_col = max(z_max_col, zd)
        z_cover[i] = z_max_col

    return z_cover

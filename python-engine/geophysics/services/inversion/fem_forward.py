from __future__ import annotations

"""
Forward FEM 2D (Poisson DC) — elementos triangulares P1 em malha quad estruturada.

Cada célula rectangular activa é dividida em 2 triângulos; condutividade constante
por célula (mesmo parâmetro m_log10 que no FDM).
"""

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

from .fdm_forward import (
    _inject_source,
    _nearest_node,
    _potential_at,
    electrode_layout,
)
from .mesh import Mesh2D, idx


def _conductivity_from_log10(m_log10: np.ndarray, mesh: Mesh2D) -> np.ndarray:
    sigma = np.zeros((mesh.nx, mesh.nz), dtype=float)
    for i in range(mesh.nx):
        for j in range(mesh.nz):
            if mesh.active[i, j]:
                sigma[i, j] = 10.0 ** float(m_log10[idx(i, j, mesh.nz)])
            else:
                sigma[i, j] = 1e-8
    return sigma


def _tri_gradients(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Matriz B (3x2) tal que ∇φ = B @ [φ1, φ2, φ3] num triângulo linear."""
    x1, y1 = x[0], y[0]
    x2, y2 = x[1], y[1]
    x3, y3 = x[2], y[2]
    area2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
    if abs(area2) < 1e-14:
        return np.zeros((2, 3))
    area = 0.5 * area2
    b1 = y2 - y3
    b2 = y3 - y1
    b3 = y1 - y2
    c1 = x3 - x2
    c2 = x1 - x3
    c3 = x2 - x1
    return np.array(
        [
            [b1 / area2, b2 / area2, b3 / area2],
            [c1 / area2, c2 / area2, c3 / area2],
        ]
    ) * area


def _assemble_fem(sigma: np.ndarray, mesh: Mesh2D) -> sparse.csr_matrix:
    nx, nz = mesh.nx, mesh.nz
    n = nx * nz
    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []

    def node_xy(i: int, j: int) -> tuple[float, float]:
        return float(mesh.x_centers[i]), float(mesh.z_centers[j])

    def add_entry(r: int, c: int, v: float) -> None:
        rows.append(r)
        cols.append(c)
        data.append(v)

    for i in range(nx):
        for j in range(nz):
            if not mesh.active[i, j]:
                r = idx(i, j, nz)
                add_entry(r, r, 1.0)
                continue

            s_c = float(sigma[i, j])
            # Triângulo inferior-esquerdo: (i,j), (i+1,j), (i,j+1)
            if i + 1 < nx and j + 1 < nz and mesh.active[i + 1, j] and mesh.active[i, j + 1]:
                nodes = [
                    idx(i, j, nz),
                    idx(i + 1, j, nz),
                    idx(i, j + 1, nz),
                ]
                coords = np.array(
                    [node_xy(i, j), node_xy(i + 1, j), node_xy(i, j + 1)],
                    dtype=float,
                )
                b = _tri_gradients(coords[:, 0], coords[:, 1])
                ke = s_c * (b.T @ b)
                for a in range(3):
                    for b_idx in range(3):
                        add_entry(nodes[a], nodes[b_idx], float(ke[a, b_idx]))

            # Triângulo superior-direito: (i+1,j), (i+1,j+1), (i,j+1)
            if i + 1 < nx and j + 1 < nz and mesh.active[i + 1, j] and mesh.active[i + 1, j + 1] and mesh.active[i, j + 1]:
                nodes = [
                    idx(i + 1, j, nz),
                    idx(i + 1, j + 1, nz),
                    idx(i, j + 1, nz),
                ]
                coords = np.array(
                    [node_xy(i + 1, j), node_xy(i + 1, j + 1), node_xy(i, j + 1)],
                    dtype=float,
                )
                b = _tri_gradients(coords[:, 0], coords[:, 1])
                ke = s_c * (b.T @ b)
                for a in range(3):
                    for b_idx in range(3):
                        add_entry(nodes[a], nodes[b_idx], float(ke[a, b_idx]))

            # Superfície: penalização Neumann (mesma ideia que FDM)
            if j == 0 or (j > 0 and not mesh.active[i, j - 1]):
                r = idx(i, j, nz)
                dz = mesh.z_max / max(nz, 1)
                add_entry(r, r, s_c / (dz * dz) * 4.0)

    return sparse.csr_matrix((data, (rows, cols)), shape=(n, n))


def forward_reading_log10(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    station_m: float,
    n: int,
    a_m: float,
    current_ma: float = 50.0,
) -> float:
    sigma = _conductivity_from_log10(m_log10, mesh)
    mat = _assemble_fem(sigma, mesh)
    rhs = np.zeros(mesh.nx * mesh.nz, dtype=float)
    layout = electrode_layout(station_m, n, a_m)
    i_a = max(current_ma, 1e-3) / 1000.0
    _inject_source(rhs, mesh, layout.a_x, +i_a)
    _inject_source(rhs, mesh, layout.b_x, -i_a)
    try:
        phi = spsolve(mat, rhs)
    except Exception:
        return float(np.mean(m_log10))
    v_m = _potential_at(mesh, phi, layout.m_x)
    v_n = _potential_at(mesh, phi, layout.n_x)
    delta_v = v_m - v_n
    rho_a = layout.k_geom * abs(delta_v) / max(i_a, 1e-6)
    rho_a = max(rho_a, 1e-6)
    return float(np.log10(rho_a))


def forward_log10(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
) -> np.ndarray:
    sigma = _conductivity_from_log10(m_log10, mesh)
    mat = _assemble_fem(sigma, mesh)
    out = np.zeros(len(readings), dtype=float)
    for k, r in enumerate(readings):
        i_ma = r.get("i_ma")
        current = float(i_ma) if i_ma and i_ma > 0 else 50.0
        rhs = np.zeros(mesh.nx * mesh.nz, dtype=float)
        layout = electrode_layout(float(r["station_m"]), int(r["n"]), float(r["a_m"]))
        i_a = max(current, 1e-3) / 1000.0
        _inject_source(rhs, mesh, layout.a_x, +i_a)
        _inject_source(rhs, mesh, layout.b_x, -i_a)
        try:
            phi = spsolve(mat, rhs)
        except Exception:
            out[k] = float(np.mean(m_log10))
            continue
        v_m = _potential_at(mesh, phi, layout.m_x)
        v_n = _potential_at(mesh, phi, layout.n_x)
        delta_v = v_m - v_n
        rho_a = layout.k_geom * abs(delta_v) / max(i_a, 1e-6)
        out[k] = float(np.log10(max(rho_a, 1e-6)))
    return out

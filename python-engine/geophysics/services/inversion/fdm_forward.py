from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

from .mesh import Mesh2D, idx


@dataclass
class ElectrodeLayout:
    a_x: float
    b_x: float
    m_x: float
    n_x: float
    k_geom: float


def electrode_layout(station_m: float, n: int, a_m: float) -> ElectrodeLayout:
    """Arranjo dipolo-dipolo colinear simplificado (perfil 2D)."""
    a = max(a_m, 0.5)
    sep = max(n, 1) * a
    m_x = station_m - 0.5 * a
    n_x = station_m + 0.5 * a
    a_x = station_m - sep - 0.5 * a
    b_x = station_m + sep + 0.5 * a
    am = max(abs(m_x - a_x), 1e-3)
    an = max(abs(n_x - a_x), 1e-3)
    bm = max(abs(m_x - b_x), 1e-3)
    bn = max(abs(n_x - b_x), 1e-3)
    mn = max(abs(m_x - n_x), 1e-3)
    k_geom = 2.0 * math.pi * (1.0 / mn - 1.0 / am - 1.0 / an + 1.0 / bn)
    k_geom = max(abs(k_geom), 1e-6)
    return ElectrodeLayout(a_x=a_x, b_x=b_x, m_x=m_x, n_x=n_x, k_geom=k_geom)


def _nearest_node(mesh: Mesh2D, x: float, z: float = 0.0) -> tuple[int, int] | None:
    if x < mesh.x0 or x > mesh.x1:
        return None
    i = int(np.clip(np.searchsorted(mesh.x_centers, x), 0, mesh.nx - 1))
    j = int(np.clip(np.searchsorted(mesh.z_centers, max(z, mesh.surface_z[i])), 0, mesh.nz - 1))
    if not mesh.active[i, j]:
        for jj in range(mesh.nz):
            if mesh.active[i, jj]:
                j = jj
                break
        else:
            return None
    return i, j


def _conductivity_from_log10(m_log10: np.ndarray, mesh: Mesh2D) -> np.ndarray:
    sigma = np.zeros((mesh.nx, mesh.nz), dtype=float)
    for i in range(mesh.nx):
        for j in range(mesh.nz):
            if mesh.active[i, j]:
                sigma[i, j] = 10.0 ** float(m_log10[idx(i, j, mesh.nz)])
            else:
                sigma[i, j] = 1e-8
    return sigma


def _build_system(sigma: np.ndarray, mesh: Mesh2D) -> tuple[sparse.csr_matrix, np.ndarray]:
    nx, nz = mesh.nx, mesh.nz
    n = nx * nz
    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []
    rhs = np.zeros(n, dtype=float)

    dx = (mesh.x1 - mesh.x0) / max(nx, 1)
    dz = mesh.z_max / max(nz, 1)

    def add(i: int, j: int, val: float) -> None:
        if 0 <= i < nx and 0 <= j < nz and mesh.active[i, j]:
            rows.append(idx(i, j, nz))
            cols.append(idx(i, j, nz))
            data.append(val)

    for i in range(nx):
        for j in range(nz):
            if not mesh.active[i, j]:
                add(i, j, 1.0)
                continue
            s_c = sigma[i, j]
            diag = 0.0
            neighbors: list[tuple[int, int, float]] = []

            if i + 1 < nx and mesh.active[i + 1, j]:
                s_e = 2.0 * s_c * sigma[i + 1, j] / (s_c + sigma[i + 1, j] + 1e-12)
                c = s_e / (dx * dx)
                neighbors.append((i + 1, j, c))
                diag += c
            if i > 0 and mesh.active[i - 1, j]:
                s_w = 2.0 * s_c * sigma[i - 1, j] / (s_c + sigma[i - 1, j] + 1e-12)
                c = s_w / (dx * dx)
                neighbors.append((i - 1, j, c))
                diag += c
            if j + 1 < nz and mesh.active[i, j + 1]:
                s_s = 2.0 * s_c * sigma[i, j + 1] / (s_c + sigma[i, j + 1] + 1e-12)
                c = s_s / (dz * dz)
                neighbors.append((i, j + 1, c))
                diag += c
            if j > 0 and mesh.active[i, j - 1]:
                s_n = 2.0 * s_c * sigma[i, j - 1] / (s_c + sigma[i, j - 1] + 1e-12)
                c = s_n / (dz * dz)
                neighbors.append((i, j - 1, c))
                diag += c

            if j == 0 or (j > 0 and not mesh.active[i, j - 1]):
                diag += s_c / (dz * dz) * 4.0

            add(i, j, diag)
            for ni, nj, c in neighbors:
                rows.append(idx(i, j, nz))
                cols.append(idx(ni, nj, nz))
                data.append(-c)

    mat = sparse.csr_matrix((data, (rows, cols)), shape=(n, n))
    return mat, rhs


def _inject_source(rhs: np.ndarray, mesh: Mesh2D, x_pos: float, current: float) -> None:
    node = _nearest_node(mesh, x_pos, z=mesh.surface_z.min())
    if node is None:
        return
    i, j = node
    rhs[idx(i, j, mesh.nz)] += current


def _potential_at(mesh: Mesh2D, phi: np.ndarray, x_pos: float) -> float:
    node = _nearest_node(mesh, x_pos)
    if node is None:
        return 0.0
    i, j = node
    return float(phi[idx(i, j, mesh.nz)])


def forward_reading_log10(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    station_m: float,
    n: int,
    a_m: float,
    current_ma: float = 50.0,
) -> float:
    sigma = _conductivity_from_log10(m_log10, mesh)
    mat, rhs = _build_system(sigma, mesh)
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
    out = np.zeros(len(readings), dtype=float)
    for k, r in enumerate(readings):
        i_ma = r.get("i_ma")
        current = float(i_ma) if i_ma and i_ma > 0 else 50.0
        out[k] = forward_reading_log10(
            m_log10,
            mesh,
            float(r["station_m"]),
            int(r["n"]),
            float(r["a_m"]),
            current_ma=current,
        )
    return out

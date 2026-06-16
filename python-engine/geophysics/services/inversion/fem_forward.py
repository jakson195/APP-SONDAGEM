from __future__ import annotations

"""
Forward FEM 2D (Poisson DC) — elementos triangulares P1.

Malha adaptativa estruturada: cada célula rectangular activa é dividida em 2
triângulos nos **vértices** (x_edges, z_edges). Condutividade constante por
célula (parâmetro m_log10 em log₁₀ ρ).
"""

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

from .fdm_forward import (
    _conductivity_from_log10,
    _mean_active_resistivity,
    electrode_layout,
)
from .mesh import Mesh2D


def _node_idx(i: int, j: int, nz: int) -> int:
    return i * (nz + 1) + j


def _node_xy(mesh: Mesh2D, i: int, j: int) -> tuple[float, float]:
    return float(mesh.x_edges[i]), float(mesh.z_edges[j])


def _nearest_corner_node(mesh: Mesh2D, x_pos: float, z_hint: float | None = None) -> tuple[int, int] | None:
    if x_pos < mesh.x0 or x_pos > mesh.x1:
        return None
    i = int(np.clip(np.searchsorted(mesh.x_edges, x_pos, side="right") - 1, 0, mesh.nx))
    if z_hint is None:
        if mesh.surface_z.size > 0:
            z_hint = float(mesh.surface_z[i])
        else:
            z_hint = 0.0
    j = int(np.clip(np.searchsorted(mesh.z_edges, z_hint, side="right") - 1, 0, mesh.nz))
    if not mesh.active[i, min(j, mesh.nz - 1)]:
        for jj in range(mesh.nz):
            if mesh.active[i, jj]:
                j = jj
                break
        else:
            return None
    return i, j


def _pin_reference_potential_fem(
    mat: sparse.csr_matrix,
    rhs: np.ndarray,
    mesh: Mesh2D,
) -> tuple[sparse.csr_matrix, np.ndarray]:
    pin: int | None = None
    i_mid = mesh.nx // 2
    for j in range(mesh.nz + 1):
        if j < mesh.nz and mesh.active[i_mid, j]:
            pin = _node_idx(i_mid, j, mesh.nz)
            break
    if pin is None:
        for i in range(mesh.nx):
            for j in range(mesh.nz):
                if mesh.active[i, j]:
                    pin = _node_idx(i, j, mesh.nz)
                    break
            if pin is not None:
                break
    if pin is None:
        return mat, rhs
    mat = mat.tolil()
    mat[pin, :] = 0.0
    mat[:, pin] = 0.0
    mat[pin, pin] = 1.0
    rhs = rhs.copy()
    rhs[pin] = 0.0
    return mat.tocsr(), rhs


def _tri_gradients(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    x1, y1 = x[0], y[0]
    x2, y2 = x[1], y[1]
    x3, y3 = x[2], y[2]
    area2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
    if abs(area2) < 1e-14:
        return np.zeros((2, 3))
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
    )


def _assemble_fem(sigma: np.ndarray, mesh: Mesh2D) -> tuple[sparse.csr_matrix, np.ndarray]:
    nx, nz = mesh.nx, mesh.nz
    n_nodes = (nx + 1) * (nz + 1)
    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []

    def add_entry(r: int, c: int, v: float) -> None:
        rows.append(r)
        cols.append(c)
        data.append(v)

    for i in range(nx):
        for j in range(nz):
            if not mesh.active[i, j]:
                continue
            s_c = float(sigma[i, j])

            tris = [
                (
                    [_node_idx(i, j, nz), _node_idx(i + 1, j, nz), _node_idx(i, j + 1, nz)],
                    [_node_xy(mesh, i, j), _node_xy(mesh, i + 1, j), _node_xy(mesh, i, j + 1)],
                ),
                (
                    [
                        _node_idx(i + 1, j, nz),
                        _node_idx(i + 1, j + 1, nz),
                        _node_idx(i, j + 1, nz),
                    ],
                    [
                        _node_xy(mesh, i + 1, j),
                        _node_xy(mesh, i + 1, j + 1),
                        _node_xy(mesh, i, j + 1),
                    ],
                ),
            ]
            for nodes, coords in tris:
                xy = np.array(coords, dtype=float)
                b = _tri_gradients(xy[:, 0], xy[:, 1])
                ke = s_c * (b.T @ b)
                for a in range(3):
                    for b_idx in range(3):
                        add_entry(nodes[a], nodes[b_idx], float(ke[a, b_idx]))

    mat = sparse.csr_matrix((data, (rows, cols)), shape=(n_nodes, n_nodes))
    rhs = np.zeros(n_nodes, dtype=float)
    return _pin_reference_potential_fem(mat, rhs, mesh)


def _inject_source_fem(rhs: np.ndarray, mesh: Mesh2D, x_pos: float, current: float) -> None:
    node = _nearest_corner_node(mesh, x_pos, z_hint=0.0)
    if node is None:
        return
    i, j = node
    rhs[_node_idx(i, j, mesh.nz)] += current


def _potential_at_fem(mesh: Mesh2D, phi: np.ndarray, x_pos: float) -> float:
    node = _nearest_corner_node(mesh, x_pos)
    if node is None:
        return 0.0
    i, j = node
    return float(phi[_node_idx(i, j, mesh.nz)])


def _homogeneous_rho_raw_fem(
    mesh: Mesh2D,
    layout,
    current_ma: float,
    rho_ref: float,
) -> float:
    m_uni = np.full(mesh.nx * mesh.nz, np.log10(max(rho_ref, 1e-6)), dtype=float)
    sigma = _conductivity_from_log10(m_uni, mesh)
    mat, rhs = _assemble_fem(sigma, mesh)
    i_a = max(current_ma, 1e-3) / 1000.0
    _inject_source_fem(rhs, mesh, layout.a_x, +i_a)
    _inject_source_fem(rhs, mesh, layout.b_x, -i_a)
    try:
        phi = spsolve(mat, rhs)
    except Exception:
        return rho_ref
    delta_v = _potential_at_fem(mesh, phi, layout.m_x) - _potential_at_fem(
        mesh, phi, layout.n_x
    )
    from .fdm_forward import apparent_resistivity_ohm_m, get_fdm_k_2d_calibration

    return apparent_resistivity_ohm_m(
        layout, delta_v, current_ma, k_extra=get_fdm_k_2d_calibration()
    )


def _apparent_rho_fem(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    layout,
    delta_v: float,
    current_ma: float,
) -> float:
    from .fdm_forward import apparent_resistivity_ohm_m, get_fdm_k_2d_calibration

    rho_raw = apparent_resistivity_ohm_m(
        layout, delta_v, current_ma, k_extra=get_fdm_k_2d_calibration()
    )
    rho_mean = _mean_active_resistivity(m_log10, mesh)
    rho_ref = _homogeneous_rho_raw_fem(mesh, layout, current_ma, rho_ref=rho_mean)
    rho_a = rho_raw * (rho_mean / max(rho_ref, 1e-12))
    return max(float(rho_a), 1e-6)


def forward_reading_log10(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    station_m: float,
    n: int,
    a_m: float,
    current_ma: float = 50.0,
) -> float:
    sigma = _conductivity_from_log10(m_log10, mesh)
    mat, rhs = _assemble_fem(sigma, mesh)
    layout = electrode_layout(station_m, n, a_m)
    i_a = max(current_ma, 1e-3) / 1000.0
    _inject_source_fem(rhs, mesh, layout.a_x, +i_a)
    _inject_source_fem(rhs, mesh, layout.b_x, -i_a)
    try:
        phi = spsolve(mat, rhs)
    except Exception:
        return float(np.mean(m_log10))
    delta_v = _potential_at_fem(mesh, phi, layout.m_x) - _potential_at_fem(
        mesh, phi, layout.n_x
    )
    rho_a = _apparent_rho_fem(m_log10, mesh, layout, delta_v, current_ma)
    return float(np.log10(rho_a))


def forward_log10(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
) -> np.ndarray:
    sigma = _conductivity_from_log10(m_log10, mesh)
    mat, _rhs0 = _assemble_fem(sigma, mesh)
    out = np.zeros(len(readings), dtype=float)
    for k, r in enumerate(readings):
        i_ma = r.get("i_ma")
        current = float(i_ma) if i_ma and i_ma > 0 else 50.0
        rhs = _rhs0.copy()
        layout = electrode_layout(float(r["station_m"]), int(r["n"]), float(r["a_m"]))
        i_a = max(current, 1e-3) / 1000.0
        _inject_source_fem(rhs, mesh, layout.a_x, +i_a)
        _inject_source_fem(rhs, mesh, layout.b_x, -i_a)
        try:
            phi = spsolve(mat, rhs)
        except Exception:
            out[k] = float(np.mean(m_log10))
            continue
        delta_v = _potential_at_fem(mesh, phi, layout.m_x) - _potential_at_fem(
            mesh, phi, layout.n_x
        )
        rho_a = _apparent_rho_fem(m_log10, mesh, layout, delta_v, current)
        out[k] = float(np.log10(rho_a))
    return out

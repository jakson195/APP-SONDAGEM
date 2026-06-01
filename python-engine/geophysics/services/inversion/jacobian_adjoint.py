from __future__ import annotations

import math

import numpy as np
from scipy.sparse.linalg import spsolve

from .fdm_forward import (
    _build_system,
    _conductivity_from_log10,
    _inject_source,
    _nearest_node,
    _potential_at,
    electrode_layout,
)
from .mesh import Mesh2D, idx


def _harmonic_deriv(local: float, neighbor: float) -> float:
    denom = local + neighbor + 1e-12
    return 2.0 * neighbor * neighbor / (denom * denom)


def _cell_dA_dot_u(
    mesh: Mesh2D,
    sigma: np.ndarray,
    u: np.ndarray,
    lam: np.ndarray,
    ci: int,
    cj: int,
) -> float:
    """λᵀ (∂A/∂σ_cell) u para célula (ci,cj) — stencil FDM 5-pontos."""
    if not mesh.active[ci, cj]:
        return 0.0
    nx, nz = mesh.nx, mesh.nz
    dx = (mesh.x1 - mesh.x0) / max(nx, 1)
    dz = mesh.z_max / max(nz, 1)
    s_c = float(sigma[ci, cj])
    acc = 0.0

    def node_u(i: int, j: int) -> float:
        return float(u[idx(i, j, nz)])

    def node_l(i: int, j: int) -> float:
        return float(lam[idx(i, j, nz)])

    # Derivada da equação no nó (ci,cj) em relação a σ(ci,cj)
    diag_deriv = 0.0
    if ci + 1 < nx and mesh.active[ci + 1, cj]:
        dse = _harmonic_deriv(s_c, float(sigma[ci + 1, cj]))
        c = dse / (dx * dx)
        diag_deriv += c
        acc -= c * node_l(ci, cj) * node_u(ci + 1, cj)
    if ci > 0 and mesh.active[ci - 1, cj]:
        dsw = _harmonic_deriv(s_c, float(sigma[ci - 1, cj]))
        c = dsw / (dx * dx)
        diag_deriv += c
        acc -= c * node_l(ci, cj) * node_u(ci - 1, cj)
    if cj + 1 < nz and mesh.active[ci, cj + 1]:
        dss = _harmonic_deriv(s_c, float(sigma[ci, cj + 1]))
        c = dss / (dz * dz)
        diag_deriv += c
        acc -= c * node_l(ci, cj) * node_u(ci, cj + 1)
    if cj > 0 and mesh.active[ci, cj - 1]:
        dsn = _harmonic_deriv(s_c, float(sigma[ci, cj - 1]))
        c = dsn / (dz * dz)
        diag_deriv += c
        acc -= c * node_l(ci, cj) * node_u(ci, cj - 1)
    if cj == 0 or (cj > 0 and not mesh.active[ci, cj - 1]):
        diag_deriv += 1.0 / (dz * dz) * 4.0

    acc += diag_deriv * node_l(ci, cj) * node_u(ci, cj)

    # Contribuições nas equações dos vizinhos onde σ(ci,cj) entra no harmonic mean
    if ci + 1 < nx and mesh.active[ci + 1, cj]:
        dse = _harmonic_deriv(float(sigma[ci + 1, cj]), s_c)
        c = dse / (dx * dx)
        acc -= c * node_l(ci + 1, cj) * node_u(ci, cj)
        acc += c * node_l(ci + 1, cj) * node_u(ci + 1, cj)
    if ci > 0 and mesh.active[ci - 1, cj]:
        dsw = _harmonic_deriv(float(sigma[ci - 1, cj]), s_c)
        c = dsw / (dx * dx)
        acc -= c * node_l(ci - 1, cj) * node_u(ci, cj)
        acc += c * node_l(ci - 1, cj) * node_u(ci - 1, cj)
    if cj + 1 < nz and mesh.active[ci, cj + 1]:
        dss = _harmonic_deriv(float(sigma[ci, cj + 1]), s_c)
        c = dss / (dz * dz)
        acc -= c * node_l(ci, cj + 1) * node_u(ci, cj)
        acc += c * node_l(ci, cj + 1) * node_u(ci, cj + 1)
    if cj > 0 and mesh.active[ci, cj - 1]:
        dsn = _harmonic_deriv(float(sigma[ci, cj - 1]), s_c)
        c = dsn / (dz * dz)
        acc -= c * node_l(ci, cj - 1) * node_u(ci, cj)
        acc += c * node_l(ci, cj - 1) * node_u(ci, cj - 1)

    return acc


def jacobian_adjoint(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
) -> np.ndarray:
    """
    Jacobiana ∂d/∂m (d = log10 ρa) via adjoint state.
    Custo: nd solves adjoint + nd forward (vs nm forward no FD).
    """
    sigma = _conductivity_from_log10(m_log10, mesh)
    mat, _ = _build_system(sigma, mesh)
    nd = len(readings)
    nm = m_log10.size
    j = np.zeros((nd, nm), dtype=float)
    ln10 = math.log(10.0)

    for k, r in enumerate(readings):
        station_m = float(r["station_m"])
        n = int(r["n"])
        a_m = float(r["a_m"])
        i_ma = r.get("i_ma")
        current_ma = float(i_ma) if i_ma and i_ma > 0 else 50.0
        i_a = max(current_ma, 1e-3) / 1000.0

        layout = electrode_layout(station_m, n, a_m)
        rhs = np.zeros(mesh.nx * mesh.nz, dtype=float)
        _inject_source(rhs, mesh, layout.a_x, +i_a)
        _inject_source(rhs, mesh, layout.b_x, -i_a)
        try:
            u = spsolve(mat, rhs)
        except Exception:
            j[k, :] = 0.0
            continue

        v_m = _potential_at(mesh, u, layout.m_x)
        v_n = _potential_at(mesh, u, layout.n_x)
        delta_v = v_m - v_n
        rho_a = layout.k_geom * abs(delta_v) / max(i_a, 1e-6)
        rho_a = max(rho_a, 1e-6)

        adj_rhs = np.zeros(mesh.nx * mesh.nz, dtype=float)
        pot_scale = layout.k_geom / (max(i_a, 1e-6) * rho_a * ln10)
        m_node = _nearest_node(mesh, layout.m_x)
        n_node = _nearest_node(mesh, layout.n_x)
        if m_node is not None:
            mi, mj = m_node
            adj_rhs[idx(mi, mj, mesh.nz)] += pot_scale
        if n_node is not None:
            ni, nj = n_node
            adj_rhs[idx(ni, nj, mesh.nz)] -= pot_scale

        try:
            lam = spsolve(mat.transpose(), adj_rhs)
        except Exception:
            continue

        for ci in range(mesh.nx):
            for cj in range(mesh.nz):
                if not mesh.active[ci, cj]:
                    continue
                cell_k = idx(ci, cj, mesh.nz)
                d_rho = -_cell_dA_dot_u(mesh, sigma, u, lam, ci, cj)
                s_c = float(sigma[ci, cj])
                j[k, cell_k] = (s_c / rho_a) * d_rho / ln10

    if np.allclose(j, 0.0):
        from .jacobian import jacobian_fd

        return jacobian_fd(m_log10, mesh, readings, eps=0.02)

    return j

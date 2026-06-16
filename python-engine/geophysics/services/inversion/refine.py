from __future__ import annotations

import numpy as np

from .fdm_forward import electrode_layout
from .mesh import Mesh2D, _interp_surface, _z_edges_depth


def _collect_electrode_x(readings: list[dict]) -> np.ndarray:
    xs: list[float] = []
    for r in readings:
        layout = electrode_layout(float(r["station_m"]), int(r["n"]), float(r["a_m"]))
        xs.extend([layout.a_x, layout.b_x, layout.m_x, layout.n_x])
    return np.array(xs, dtype=float)


def _refine_intervals(edges: np.ndarray, focus_x: np.ndarray, max_cells: int) -> np.ndarray:
    """Subdivide células que contêm eletrodos até atingir max_cells."""
    x0, x1 = float(edges[0]), float(edges[-1])
    focus = focus_x[(focus_x >= x0) & (focus_x <= x1)]
    if focus.size == 0:
        return edges

    while edges.size - 1 < max_cells:
        mids = 0.5 * (edges[:-1] + edges[1:])
        inside = np.any((focus[:, None] >= edges[:-1]) & (focus[:, None] < edges[1:]), axis=0)
        if not np.any(inside):
            break
        new_edges: list[float] = [float(edges[0])]
        for i in range(edges.size - 1):
            new_edges.append(float(edges[i + 1]))
            if inside[i] and len(new_edges) - 1 < max_cells:
                new_edges.insert(-1, float(mids[i]))
        edges = np.array(new_edges, dtype=float)
        if edges.size - 1 >= max_cells:
            break
    return edges


def _refine_depth_near_surface(
    z_edges: np.ndarray, max_layers: int, surface_fraction: float = 0.45
) -> np.ndarray:
    """Refina camadas superficiais (onde a sensibilidade DC é maior)."""
    z_max = float(z_edges[-1])
    z_cut = z_max * surface_fraction
    edges = z_edges.copy()
    while edges.size - 1 < max_layers:
        mids = 0.5 * (edges[:-1] + edges[1:])
        inside = (edges[:-1] < z_cut) & (edges[1:] <= z_cut + 1e-9)
        if not np.any(inside):
            inside = edges[:-1] < z_cut
        if not np.any(inside):
            break
        new_edges: list[float] = [float(edges[0])]
        for i in range(edges.size - 1):
            new_edges.append(float(edges[i + 1]))
            if inside[i] and len(new_edges) - 1 < max_layers:
                new_edges.insert(-1, float(mids[i]))
        edges = np.array(new_edges, dtype=float)
        if edges.size - 1 >= max_layers:
            break
    return edges


def build_adaptive_mesh(
    x0: float,
    x1: float,
    z_max: float,
    base_nx: int,
    base_nz: int,
    readings: list[dict],
    topography: list[tuple[float, float]] | None = None,
    *,
    max_nx: int = 48,
    max_nz: int = 32,
    apply_coverage_mask: bool = False,
) -> Mesh2D:
    """
    Malha não-uniforme: refinamento local em eletrodos (x) e camadas superficiais (z).
    """
    focus_x = _collect_electrode_x(readings)
    x_edges = np.linspace(x0, x1, base_nx + 1)
    z_edges = _z_edges_depth(base_nz, z_max, geometric=True)

    target_nx = min(max_nx, max(base_nx + 8, base_nx + focus_x.size))
    target_nz = min(max_nz, max(base_nz + 4, base_nz + 4))

    x_edges = _refine_intervals(x_edges, focus_x, target_nx)
    z_edges = _refine_depth_near_surface(z_edges, target_nz)

    nx = max(4, x_edges.size - 1)
    nz = max(4, z_edges.size - 1)
    x_centers = 0.5 * (x_edges[:-1] + x_edges[1:])
    z_centers = 0.5 * (z_edges[:-1] + z_edges[1:])

    if topography:
        topo_x = np.array([p[0] for p in topography], dtype=float)
        topo_z = np.array([p[1] for p in topography], dtype=float)
        order = np.argsort(topo_x)
        topo_x = topo_x[order]
        topo_z = topo_z[order]
    else:
        topo_x = np.array([], dtype=float)
        topo_z = np.array([], dtype=float)

    surface_z = np.array([_interp_surface(x, topo_x, topo_z) for x in x_centers])
    # z_centers = profundidade (m); surface_z = cota topográfica — não comparar directamente.
    # Máscara trapezoidal desactivada por defeito (evita desactivar todas as células).
    if apply_coverage_mask and topography:
        active = np.zeros((nx, nz), dtype=bool)
        z_surf_min = float(np.min(surface_z)) if surface_z.size else 0.0
        for i in range(nx):
            depth_below = float(surface_z[i]) - z_surf_min
            for j in range(nz):
                active[i, j] = z_centers[j] <= depth_below + z_max + 1e-6
    else:
        active = np.ones((nx, nz), dtype=bool)

    return Mesh2D(
        nx=nx,
        nz=nz,
        x0=x0,
        x1=x1,
        z_max=z_max,
        x_centers=x_centers,
        z_centers=z_centers,
        x_edges=x_edges,
        z_edges=z_edges,
        active=active,
        surface_z=surface_z,
    )

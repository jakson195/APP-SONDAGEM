from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Mesh2D:
    nx: int
    nz: int
    x0: float
    x1: float
    z_max: float
    x_centers: np.ndarray
    z_centers: np.ndarray
    x_edges: np.ndarray
    z_edges: np.ndarray
    active: np.ndarray
    surface_z: np.ndarray


def _interp_surface(x: float, topo_x: np.ndarray, topo_z: np.ndarray) -> float:
    if topo_x.size == 0:
        return 0.0
    return float(np.interp(x, topo_x, topo_z))


def _z_edges_depth(nz: int, z_max: float, geometric: bool) -> np.ndarray:
    """Camadas mais finas no topo (geométrico ≈ RES2DINV / XI2IP)."""
    if geometric and nz > 1 and z_max > 0:
        z_edges = np.geomspace(max(z_max / (2**nz), 0.05), z_max, nz + 1)
        z_edges[0] = 0.0
        return z_edges
    return np.linspace(0.0, z_max, nz + 1)


def build_mesh(
    x0: float,
    x1: float,
    z_max: float,
    nx: int,
    nz: int,
    topography: list[tuple[float, float]] | None = None,
    *,
    geometric_z: bool = True,
) -> Mesh2D:
    x_edges = np.linspace(x0, x1, nx + 1)
    z_edges = _z_edges_depth(nz, z_max, geometric_z)
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
    # z_centers = profundidade (m) abaixo da superfície local; surface_z = cota (m) só
    # para visualização. NÃO comparar profundidade com cota — isso desactivava
    # todas as células (ex.: 5 m >= 128 m) e a inversão ficava homogénea.
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


def idx(i: int, j: int, nz: int) -> int:
    return i * nz + j


def model_shape(mesh: Mesh2D) -> tuple[int, int]:
    return mesh.nx, mesh.nz

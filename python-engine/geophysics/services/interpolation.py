"""Interpolação 3D entre secções geofísicas — IDW, Kriging (GSTools), RBF (SciPy)."""

from __future__ import annotations

import numpy as np
from scipy.interpolate import RBFInterpolator

from schemas.volume import SamplePoint3D, VolumeBounds, VolumeBuildRequest


def _grid_centers(req: VolumeBuildRequest) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    b = req.bounds
    xs = np.linspace(b.min_x, b.max_x, req.nx)
    ys = np.linspace(b.min_y, b.max_y, req.ny)
    zs = np.linspace(0.5 * b.max_z / req.nz, b.max_z - 0.5 * b.max_z / req.nz, req.nz)
    return xs, ys, zs


def _sample_arrays(points: list[SamplePoint3D]) -> tuple[np.ndarray, np.ndarray]:
    if not points:
        return np.empty((0, 3)), np.empty(0)
    coords = np.array([[p.x, p.y, p.z] for p in points], dtype=np.float64)
    values = np.array([p.value for p in points], dtype=np.float64)
    mask = np.isfinite(values) & np.all(np.isfinite(coords), axis=1)
    return coords[mask], values[mask]


def _idw_at(
    x: float,
    y: float,
    z: float,
    coords: np.ndarray,
    values: np.ndarray,
    power: float,
    max_dist: float,
) -> float | None:
    dx = coords[:, 0] - x
    dy = coords[:, 1] - y
    dz = coords[:, 2] - z
    dist = np.sqrt(dx * dx + dy * dy + dz * dz)
    near = dist < max_dist
    if not np.any(near):
        return None
    d = dist[near]
    v = values[near]
    exact = d < 1e-3
    if np.any(exact):
        return float(v[np.argmin(d)])
    w = 1.0 / np.power(d, power)
    return float(np.sum(w * v) / np.sum(w))


def build_idw_volume(req: VolumeBuildRequest) -> np.ndarray:
    coords, values = _sample_arrays(req.sample_points)
    xs, ys, zs = _grid_centers(req)
    out = np.full((req.nx, req.ny, req.nz), np.nan, dtype=np.float64)
    for ki, z in enumerate(zs):
        for ji, y in enumerate(ys):
            for ii, x in enumerate(xs):
                val = _idw_at(
                    x, y, z, coords, values, req.idw_power, req.max_influence_m
                )
                if val is not None:
                    out[ii, ji, ki] = val
    return out


def build_rbf_volume(req: VolumeBuildRequest) -> np.ndarray:
    coords, values = _sample_arrays(req.sample_points)
    if len(values) < 4:
        return build_idw_volume(req)

    xs, ys, zs = _grid_centers(req)
    xx, yy, zz = np.meshgrid(xs, ys, zs, indexing="ij")
    targets = np.column_stack([xx.ravel(), yy.ravel(), zz.ravel()])

    eps = req.rbf_epsilon
    if eps is None:
        span = max(
            req.bounds.max_x - req.bounds.min_x,
            req.bounds.max_y - req.bounds.min_y,
            req.bounds.max_z,
            1.0,
        )
        eps = span / max(len(values) ** 0.25, 2.0)

    rbf = RBFInterpolator(coords, values, kernel="multiquadric", epsilon=eps)
    pred = rbf(targets)
    out = pred.reshape(req.nx, req.ny, req.nz)
    return out.astype(np.float64)


def build_kriging_volume(req: VolumeBuildRequest) -> np.ndarray:
    try:
        import gstools as gs
    except ImportError:
        return build_rbf_volume(req)

    coords, values = _sample_arrays(req.sample_points)
    if len(values) < 6:
        return build_rbf_volume(req)

    xs, ys, zs = _grid_centers(req)
    out = np.full((req.nx, req.ny, req.nz), np.nan, dtype=np.float64)

    span_xy = max(
        req.bounds.max_x - req.bounds.min_x,
        req.bounds.max_y - req.bounds.min_y,
        10.0,
    )
    vario_map = {
        "spherical": gs.Spherical,
        "exponential": gs.Exponential,
        "gaussian": gs.Gaussian,
    }
    Model = vario_map.get(req.kriging_variogram, gs.Spherical)

    for ki, z in enumerate(zs):
        layer = np.abs(coords[:, 2] - z) <= req.bounds.max_z / req.nz * 1.5
        if np.sum(layer) < 4:
            layer = np.ones(len(values), dtype=bool)

        c_xy = coords[layer, :2]
        v_xy = values[layer]
        if len(v_xy) < 4:
            continue

        model = Model(dim=2, var=float(np.var(v_xy)) or 1.0, len_scale=span_xy / 4)
        krige = gs.krige.Ordinary(model, c_xy.T, v_xy)
        field, _ = krige((xs, ys), return_var=True)
        out[:, :, ki] = field

    nan_mask = np.isnan(out)
    if np.any(nan_mask):
        fallback = build_idw_volume(req)
        out[nan_mask] = fallback[nan_mask]
    return out


def build_volume(req: VolumeBuildRequest) -> np.ndarray:
    if req.method == "rbf":
        return build_rbf_volume(req)
    if req.method == "kriging":
        return build_kriging_volume(req)
    return build_idw_volume(req)


def volume_to_list(vol: np.ndarray) -> list[float]:
    """Row-major i + j*nx + k*nx*ny (same as frontend)."""
    nx, ny, nz = vol.shape
    flat = np.empty(nx * ny * nz, dtype=np.float64)
    idx = 0
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                flat[idx] = vol[i, j, k]
                idx += 1
    return [float(x) if np.isfinite(x) else float("nan") for x in flat]

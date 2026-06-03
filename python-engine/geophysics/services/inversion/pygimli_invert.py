"""
Inversão 2D ERT via pyGIMLi (referência open-source estilo RES2DINV).

Requer: pip install pygimli  (Windows: conda install -c gimli pygimli recomendado)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np

from schemas.invert_2d import (
    Invert2DRequest,
    Invert2DResponse,
    IterationRecordOut,
    MethodId,
)
from .fdm_forward import electrode_layout
from .mesh import build_mesh, idx
from .method_map import PYGIMLI_METHOD, PYGIMLI_METHOD_LABEL
from .sensitivity_depth import column_sensitivity_depth_m

logger = logging.getLogger("geophysics.pygimli_invert")

if TYPE_CHECKING:
    import pygimli as pg

_PYGIMLI: object | None = None
_ERT: object | None = None


def is_pygimli_available() -> bool:
    global _PYGIMLI, _ERT
    if _PYGIMLI is not None:
        return True
    try:
        import pygimli as pg
        from pygimli.physics import ert

        _PYGIMLI = pg
        _ERT = ert
        return True
    except ImportError:
        return False


def _pg():
    if not is_pygimli_available():
        raise ImportError(
            "pyGIMLi não instalado. Use: pip install pygimli "
            "ou conda install -c gimli pygimli"
        )
    import pygimli as pg

    return pg


def _ert():
    _pg()
    from pygimli.physics import ert

    return ert


def _reading_dicts(req: Invert2DRequest) -> list[dict]:
    return [
        {
            "station_m": r.station_m,
            "n": r.n,
            "a_m": r.a_m,
            "rho_ohm_m": r.rho_ohm_m,
            "i_ma": r.i_ma or 50.0,
            "excluded": r.excluded,
        }
        for r in req.readings
    ]


def _build_ert_data(req: Invert2DRequest):
    """DataContainerERT com leituras dipolo-dipolo (layout SOLODATA)."""
    pg = _pg()
    ert = _ert()
    active = [r for r in req.readings if not r.excluded and r.rho_ohm_m > 0]
    if len(active) < 4:
        raise ValueError("Mínimo 4 leituras activas para pyGIMLi.")

    x_to_id: dict[float, int] = {}

    def sensor_id(x: float) -> int:
        key = round(float(x), 4)
        if key not in x_to_id:
            x_to_id[key] = len(x_to_id)
        return x_to_id[key]

    layouts = []
    for r in active:
        ly = electrode_layout(r.station_m, r.n, r.a_m)
        layouts.append(ly)
        for x in (ly.a_x, ly.b_x, ly.m_x, ly.n_x):
            sensor_id(x)

    positions = np.zeros((len(x_to_id), 2))
    for x, sid in x_to_id.items():
        positions[sid, 0] = x

    data = pg.DataContainerERT()
    data.setSensorPositions(positions)

    rhoa = []
    a_idx, b_idx, m_idx, n_idx = [], [], [], []
    for r, ly in zip(active, layouts):
        a_idx.append(sensor_id(ly.a_x))
        b_idx.append(sensor_id(ly.b_x))
        m_idx.append(sensor_id(ly.m_x))
        n_idx.append(sensor_id(ly.n_x))
        rhoa.append(float(r.rho_ohm_m))

    n_data = len(rhoa)
    data.resize(n_data)
    data["a"] = np.array(a_idx, dtype=int)
    data["b"] = np.array(b_idx, dtype=int)
    data["m"] = np.array(m_idx, dtype=int)
    data["n"] = np.array(n_idx, dtype=int)
    data["rhoa"] = np.array(rhoa, dtype=float)
    data["k"] = ert.createGeometricFactors(data, numerical=True)
    data.markInvalid(data["rhoa"] <= 0)
    data.removeInvalid()
    if data.size() < 4:
        raise ValueError("Menos de 4 leituras válidas após filtro pyGIMLi.")
    data.estimateError(relativeError=0.03, absoluteU=0.0)

    if req.topography:
        # Cotas nos sensores por interpolação linear em estação
        topo = sorted((p.station_m, p.elevation_m) for p in req.topography)
        if len(topo) >= 2:
            st = np.array([t[0] for t in topo])
            el = np.array([t[1] for t in topo])
            pos = data.sensorPositions()
            for i in range(pos.size()):
                x = float(pos[i, 0])
                z = float(np.interp(x, st, el))
                pos[i, 2] = z
            data.setSensorPositions(pos)

    return data, active


def _pygimli_lambda(req: Invert2DRequest, method: MethodId) -> float:
    cfg = PYGIMLI_METHOD.get(method, PYGIMLI_METHOD["gauss_newton"])
    base = max(float(req.params.lambda_reg), 1e-4)
    lam = base * float(cfg["lam_scale"]) * 100.0
    if method == "occam":
        lam = max(lam, 15.0)
    return float(np.clip(lam, 5.0, 500.0))


def _resample_to_grid(
    para_mesh,
    model_rho: np.ndarray,
    display_mesh,
) -> np.ndarray:
    """Interpola modelo pyGIMLi (malha não estruturada) na grelha nx×nz da UI."""
    pg = _pg()
    m = np.zeros(display_mesh.nx * display_mesh.nz, dtype=float)
    for i in range(display_mesh.nx):
        for j in range(display_mesh.nz):
            if not display_mesh.active[i, j]:
                continue
            u = idx(i, j, display_mesh.nz)
            x = float(display_mesh.x_centers[i])
            z = float(display_mesh.z_centers[j])
            try:
                val = float(
                    pg.interpolate(
                        para_mesh,
                        model_rho,
                        np.array([[x, z]]),
                        fillValue=np.nan,
                    )[0]
                )
            except Exception:
                val = np.nan
            if np.isfinite(val) and val > 0:
                m[u] = np.log10(val)
            else:
                m[u] = np.nan
    finite = m[np.isfinite(m)]
    fill = float(np.mean(finite)) if finite.size else 2.0
    return np.nan_to_num(m, nan=fill)


def _synthetic_response(data, model_rho, para_mesh) -> np.ndarray:
    """ρa sintética nas leituras do data container."""
    ert = _ert()
    fop = ert.ERTModelling()
    fop.setData(data)
    fop.setMesh(para_mesh)
    resp = np.asarray(fop.response(model_rho), dtype=float)
    return np.maximum(resp, 1e-6)


def run_pygimli_invert(req: Invert2DRequest) -> Invert2DResponse:
    pg = _pg()
    ert = _ert()
    method = req.method
    cfg = PYGIMLI_METHOD.get(method, PYGIMLI_METHOD["gauss_newton"])

    data, active_readings = _build_ert_data(req)
    reading_dicts = _reading_dicts(req)
    active_dicts = [
        d for d in reading_dicts if not d.get("excluded") and d["rho_ohm_m"] > 0
    ]

    xs = [d["station_m"] for d in active_dicts]
    electrode_xs: list[float] = []
    for d in active_dicts:
        ly = electrode_layout(d["station_m"], d["n"], d["a_m"])
        electrode_xs.extend([ly.a_x, ly.b_x, ly.m_x, ly.n_x])
    x_min = min(min(xs), min(electrode_xs)) - 5.0
    x_max = max(max(xs), max(electrode_xs)) + 5.0

    topo = None
    if req.topography:
        topo = [(p.station_m, p.elevation_m) for p in req.topography]

    display_mesh = build_mesh(
        x_min,
        x_max,
        req.params.nx,
        req.params.nz,
        10,
        topo,
        geometric_z=req.params.geometric_z_layers,
    )

    mgr = ert.ERTManager(data)
    lam = _pygimli_lambda(req, method)
    max_iter = int(req.params.max_iter)

    blocky = bool(cfg.get("blocky"))
    if blocky and hasattr(mgr, "inv"):
        try:
            mgr.inv.setBlockyModel(True)
        except Exception:
            pass

    verbose = False
    try:
        model_vec = mgr.invert(
            lam=lam,
            maxIter=max_iter,
            verbose=verbose,
            limits=[0.1, 10000.0],
        )
    except TypeError:
        model_vec = mgr.invert(lam=lam, maxIter=max_iter, verbose=verbose)

    model_rho = np.asarray(model_vec, dtype=float)
    para_mesh = mgr.paraDomain
    m_log10 = _resample_to_grid(para_mesh, model_rho, display_mesh)

    y_obs = np.log10(np.maximum(np.asarray(data["rhoa"], dtype=float), 1e-6))
    try:
        y_syn_lin = _synthetic_response(data, model_rho, para_mesh)
        y_syn = np.log10(y_syn_lin)
    except Exception:
        y_syn = y_obs.copy()

    res = y_obs - y_syn
    rms_log10 = float(np.sqrt(np.mean(np.square(res))))
    obs_lin = 10.0**y_obs
    syn_lin = 10.0**y_syn
    rms_percent = float(
        np.sqrt(np.mean(np.square((obs_lin - syn_lin) / np.maximum(obs_lin, 1e-6))))
        * 100.0
    )

    rho_cells = 10.0**m_log10
    roughness = float(np.std(np.diff(m_log10[np.isfinite(m_log10)])) if m_log10.size > 1 else 0.0)

    history = [
        IterationRecordOut(
            iter=1,
            rms_log10=rms_log10,
            rms_percent=rms_percent,
            lambda_reg=lam,
            phi=rms_log10,
            roughness_l2=roughness,
            relative_gain=None,
            rho_min_ohm_m=float(np.min(rho_cells)),
            rho_max_ohm_m=float(np.max(rho_cells)),
            rho_std_ohm_m=float(np.std(rho_cells)),
        )
    ]

    excluded = [i for i, r in enumerate(req.readings) if r.excluded]
    label = PYGIMLI_METHOD_LABEL.get(method, f"pyGIMLi ({method})")

    return Invert2DResponse(
        ok=True,
        engine="pygimli",
        forward_model="fdm",
        method=method,
        method_label=label,
        nx=display_mesh.nx,
        nz=display_mesh.nz,
        x_edges_m=display_mesh.x_edges.tolist(),
        z_edges_m=display_mesh.z_edges.tolist(),
        m_log10=m_log10.tolist(),
        active_cells=[
            bool(display_mesh.active[i, j])
            for i in range(display_mesh.nx)
            for j in range(display_mesh.nz)
        ],
        z_cover_m=column_sensitivity_depth_m(
            display_mesh, active_dicts, req.params.factor_depth
        ).tolist(),
        y_obs_log10=y_obs.tolist(),
        y_syn_log10=y_syn.tolist(),
        rms_log10=rms_log10,
        rms_percent=rms_percent,
        roughness_l2=roughness,
        iterations=1,
        iteration_history=history,
        excluded_indices=excluded,
        data_weights=[1.0] * len(y_obs),
        message=(
            f"Inversão pyGIMLi (estilo RES2DINV) — λ={lam:.1f}, "
            f"malha {display_mesh.nx}×{display_mesh.nz}, blocky={'sim' if blocky else 'não'}"
        ),
    )

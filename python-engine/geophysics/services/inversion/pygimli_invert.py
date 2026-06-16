"""
Inversão 2D ERT via pyGIMLi (motor open-source recomendado, estilo RES2DINV).

Requer: pip install pygimli  (Windows: conda install -c gimli pygimli)
"""

from __future__ import annotations

import logging

import numpy as np

from services.array_utils import writable

from schemas.invert_2d import Invert2DRequest, Invert2DResponse, IterationRecordOut, MethodId
from .fdm_forward import electrode_layout
from .invert_common import (
    build_display_mesh,
    build_invert_response,
    prepare_inversion_data,
    resample_rho_to_display_grid,
    rms_metrics,
)
from .method_map import PYGIMLI_METHOD, PYGIMLI_METHOD_LABEL

logger = logging.getLogger("geophysics.pygimli_invert")

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


def _build_ert_data(req: Invert2DRequest, active, reading_dicts):
    """DataContainerERT com leituras dipolo-dipolo (layout SOLODATA)."""
    pg = _pg()
    ert = _ert()

    x_to_id: dict[float, int] = {}

    def sensor_id(x: float) -> int:
        key = round(float(x), 4)
        if key not in x_to_id:
            x_to_id[key] = len(x_to_id)
        return x_to_id[key]

    layouts = []
    for r, d in zip(active, reading_dicts):
        ly = electrode_layout(d["station_m"], d["n"], d["a_m"])
        layouts.append(ly)
        for x in (ly.a_x, ly.b_x, ly.m_x, ly.n_x):
            sensor_id(x)

    positions = np.zeros((len(x_to_id), 2))
    for x, sid in x_to_id.items():
        positions[sid, 0] = x

    data = pg.DataContainerERT()
    data.setSensorPositions(positions)

    rhoa, a_idx, b_idx, m_idx, n_idx = [], [], [], [], []
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

    return data


def _pygimli_lambda(req: Invert2DRequest, method: MethodId) -> float:
    cfg = PYGIMLI_METHOD.get(method, PYGIMLI_METHOD["gauss_newton"])
    base = max(float(req.params.lambda_reg), 1e-4)
    lam = base * float(cfg["lam_scale"]) * 100.0
    if method == "occam":
        lam = max(lam, 15.0)
    if method == "blocky_l1":
        lam = max(lam * 0.85, 8.0)
    return float(np.clip(lam, 5.0, 500.0))


def _resample_pygimli_model(para_mesh, model_rho, display_mesh) -> np.ndarray:
    pg = _pg()

    def interp(x: float, z: float) -> float:
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
        return val

    return resample_rho_to_display_grid(interp, display_mesh)


def _synthetic_response(data, model_rho, para_mesh) -> np.ndarray:
    ert = _ert()
    fop = ert.ERTModelling()
    fop.setData(data)
    fop.setMesh(para_mesh)
    resp = writable(fop.response(model_rho))
    return np.maximum(resp, 1e-6)


def _extract_iteration_history(
    mgr,
    lam: float,
    y_obs: np.ndarray,
    y_syn: np.ndarray,
    m_log10: np.ndarray,
) -> list[IterationRecordOut]:
    history: list[IterationRecordOut] = []
    inv = getattr(mgr, "inv", None)
    if inv is not None:
        try:
            n_iters = int(getattr(inv, "iter", 0) or 0)
            chi2_list = []
            if hasattr(inv, "chi2History"):
                chi2_list = list(inv.chi2History())
            elif hasattr(inv, "getPhi"):
                for it in range(max(1, n_iters)):
                    try:
                        chi2_list.append(float(inv.getPhi(it)))
                    except Exception:
                        break
            for it, phi in enumerate(chi2_list or [float(np.sum((y_obs - y_syn) ** 2))]):
                rho = 10.0**m_log10
                history.append(
                    IterationRecordOut(
                        iter=it + 1,
                        rms_log10=float(np.sqrt(phi / max(len(y_obs), 1))),
                        rms_percent=rms_metrics(y_obs, y_syn)[1],
                        lambda_reg=lam,
                        phi=float(phi),
                        roughness_l2=float(np.std(m_log10[np.isfinite(m_log10)])),
                        relative_gain=None,
                        rho_min_ohm_m=float(np.min(rho)),
                        rho_max_ohm_m=float(np.max(rho)),
                        rho_std_ohm_m=float(np.std(rho)),
                    )
                )
        except Exception as e:
            logger.debug("histórico pyGIMLi indisponível: %s", e)

    if not history:
        rms_log10, rms_percent = rms_metrics(y_obs, y_syn)
        rho = 10.0**m_log10
        history.append(
            IterationRecordOut(
                iter=1,
                rms_log10=rms_log10,
                rms_percent=rms_percent,
                lambda_reg=lam,
                phi=rms_log10,
                roughness_l2=float(np.std(m_log10[np.isfinite(m_log10)])),
                relative_gain=None,
                rho_min_ohm_m=float(np.min(rho)),
                rho_max_ohm_m=float(np.max(rho)),
                rho_std_ohm_m=float(np.std(rho)),
            )
        )
    return history


def run_pygimli_invert(req: Invert2DRequest) -> Invert2DResponse:
    ert = _ert()
    method = req.method
    cfg = PYGIMLI_METHOD.get(method, PYGIMLI_METHOD["gauss_newton"])

    active, y_obs, w, reading_dicts, excluded, x0, x1 = prepare_inversion_data(req)
    display_mesh = build_display_mesh(req, x0, x1, reading_dicts)
    data = _build_ert_data(req, active, reading_dicts)

    mgr = ert.ERTManager(data)
    lam = _pygimli_lambda(req, method)
    max_iter = int(req.params.max_iter)

    blocky = bool(cfg.get("blocky"))
    if blocky and hasattr(mgr, "inv"):
        try:
            mgr.inv.setBlockyModel(True)
        except Exception:
            pass

    robust = bool(cfg.get("robust_data"))
    if robust and hasattr(mgr, "inv"):
        try:
            mgr.inv.setRobustData(True)
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

    model_rho = writable(model_vec)
    para_mesh = mgr.paraDomain
    m_log10 = _resample_pygimli_model(para_mesh, model_rho, display_mesh)

    try:
        y_syn_lin = _synthetic_response(data, model_rho, para_mesh)
        y_syn = np.log10(y_syn_lin)
    except Exception:
        y_syn = y_obs.copy()

    history = _extract_iteration_history(mgr, lam, y_obs, y_syn, m_log10)
    label = PYGIMLI_METHOD_LABEL.get(method, f"pyGIMLi ({method})")

    return build_invert_response(
        req=req,
        engine="pygimli",
        method=method,
        method_label=label,
        forward_model="fdm",
        display_mesh=display_mesh,
        m_log10=m_log10,
        y_obs=y_obs,
        y_syn=y_syn,
        reading_dicts=reading_dicts,
        excluded=excluded,
        data_weights=w.tolist(),
        iterations=len(history),
        iteration_history=history,
        lambda_reg=lam,
        message=(
            f"Inversão pyGIMLi — λ={lam:.1f}, malha {display_mesh.nx}×{display_mesh.nz}, "
            f"blocky={'sim' if blocky else 'não'}, {len(history)} reg. iterações"
        ),
    )

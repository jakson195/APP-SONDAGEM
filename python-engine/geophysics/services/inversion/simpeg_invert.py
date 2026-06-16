"""
Inversão 2D ERT via SimPEG (opcional).

Requer: pip install simpeg discretize
"""

from __future__ import annotations

import logging

import numpy as np

from services.array_utils import writable

from schemas.invert_2d import Invert2DRequest, Invert2DResponse, MethodId
from .fdm_forward import electrode_layout
from .invert_common import (
    build_display_mesh,
    build_invert_response,
    compute_model_z_max_m,
    prepare_inversion_data,
    resample_rho_to_display_grid,
)
from .method_map import SIMPEG_METHOD, SIMPEG_METHOD_LABEL

logger = logging.getLogger("geophysics.simpeg_invert")

_SIMPEG_OK: bool | None = None


def is_simpeg_available() -> bool:
    global _SIMPEG_OK
    if _SIMPEG_OK is not None:
        return _SIMPEG_OK
    try:
        import discretize  # noqa: F401
        from simpeg.electromagnetics.static import resistivity as dc  # noqa: F401

        _SIMPEG_OK = True
    except ImportError:
        _SIMPEG_OK = False
    return _SIMPEG_OK


def _simpeg_lambda(req: Invert2DRequest, method: MethodId) -> float:
    cfg = SIMPEG_METHOD.get(method, SIMPEG_METHOD["gauss_newton"])
    base = max(float(req.params.lambda_reg), 1e-4)
    return float(np.clip(base * float(cfg["lam_scale"]) * 80.0, 1e-3, 50.0))


def _build_survey(active, reading_dicts):
    from simpeg.electromagnetics.static import receivers, resistivity as dc
    from simpeg.electromagnetics.static import sources

    srclist = []
    for r, d in zip(active, reading_dicts):
        ly = electrode_layout(d["station_m"], d["n"], d["a_m"])
        rx = receivers.Dipole(
            np.array([[ly.m_x, 0.0], [ly.n_x, 0.0]]),
            orientation="x",
        )
        src = sources.Dipole(
            [rx],
            location=np.array([[ly.a_x, 0.0], [ly.b_x, 0.0]]),
        )
        srclist.append(src)
    return dc.survey.Survey(srclist)


def _build_mesh(x0: float, x1: float, z_max: float, nx: int, nz: int):
    from discretize import TensorMesh

    span_x = max(x1 - x0, 10.0)
    span_z = max(z_max, 5.0)
    cs_x = span_x / max(nx, 8)
    cs_z = span_z / max(nz, 6)
    pad = 4
    hx = [(cs_x, pad, -1.25), (cs_x, nx), (cs_x, pad, 1.25)]
    hz = [(cs_z, pad, -1.25), (cs_z, nz), (cs_z, pad, 1.25)]
    mesh = TensorMesh([hx, hz], x0=[x0 - pad * cs_x, -span_z - pad * cs_z])
    return mesh


def _run_simpeg_inversion(
    mesh,
    survey,
    dobs: np.ndarray,
    uncertainties: np.ndarray,
    lam: float,
    max_iter: int,
    m0: np.ndarray,
):
    from simpeg import (
        data_misfit,
        directives,
        inversion,
        maps,
        optimization,
        regularization,
    )
    from simpeg.electromagnetics.static import resistivity as dc

    simulation = dc.simulation.Simulation2DCell(mesh, survey=survey)
    sigma_map = maps.ExpMap(mesh)
    sigma0 = sigma_map * m0

    data_obj = simulation.survey.copy()
    data_obj.dobs = dobs
    data_obj.standard_deviation = uncertainties

    dmis = data_misfit.L2DataMisfit(data=data_obj, simulation=simulation)
    reg = regularization.Simple(mesh, alpha_s=lam * 0.1, alpha_x=lam, alpha_y=lam * 2.5)
    opt = optimization.InexactGaussNewton(maxIter=max_iter, LSshorten=0.5)
    inv_prob = inversion.BaseInvProblem(dmis, reg, opt)
    beta_est = directives.BetaEstimate_ByEig(beta0_ratio=1e0)
    target = directives.TargetMisfit()
    inv = inversion.Inversion(inv_prob, directiveList=[beta_est, target])
    m_opt = inv.run(sigma0)
    return writable(sigma_map * m_opt), simulation


def run_simpeg_invert(req: Invert2DRequest) -> Invert2DResponse:
    if not is_simpeg_available():
        raise ImportError(
            "SimPEG não instalado. Use: pip install simpeg discretize"
        )

    method = req.method
    active, y_obs, w, reading_dicts, excluded, x0, x1 = prepare_inversion_data(req)
    display_mesh = build_display_mesh(req, x0, x1, reading_dicts)

    z_max = compute_model_z_max_m(reading_dicts, req.params)

    mesh = _build_mesh(x0, x1, z_max, req.params.nx, req.params.nz)
    survey = _build_survey(active, reading_dicts)
    dobs = np.array([r.rho_ohm_m for r in active], dtype=float)
    unc = np.maximum(dobs * 0.03, 1e-3)

    lam = _simpeg_lambda(req, method)
    max_iter = int(req.params.max_iter)
    m0 = np.log(np.median(dobs)) * np.ones(mesh.nC)

    model_rho, simulation = _run_simpeg_inversion(
        mesh, survey, dobs, unc, lam, max_iter, m0
    )

    def interp(x: float, z: float) -> float:
        try:
            pt = np.array([[x, z]])
            val = float(mesh.interpolate_cell_centers(pt, model_rho)[0])
        except Exception:
            val = np.nan
        return val

    m_log10 = resample_rho_to_display_grid(interp, display_mesh)

    try:
        data_obj = simulation.survey.copy()
        data_obj.dobs = dobs
        syn = writable(simulation.dpred(model_rho))
        y_syn = np.log10(np.maximum(syn, 1e-6))
    except Exception:
        y_syn = y_obs.copy()

    from .invert_common import rms_metrics
    from schemas.invert_2d import IterationRecordOut

    rms_log10, rms_percent = rms_metrics(y_obs, y_syn)
    rho = 10.0**m_log10
    history = [
        IterationRecordOut(
            iter=max_iter,
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
    ]

    label = SIMPEG_METHOD_LABEL.get(method, f"SimPEG ({method})")
    return build_invert_response(
        req=req,
        engine="simpeg",
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
        iterations=max_iter,
        iteration_history=history,
        lambda_reg=lam,
        message=(
            f"Inversão SimPEG 2D — λ={lam:.4g}, malha {display_mesh.nx}×{display_mesh.nz}"
        ),
    )

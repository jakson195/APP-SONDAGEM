from __future__ import annotations

import numpy as np

from schemas.invert_2d import (
    ForwardModelId,
    Invert2DRequest,
    Invert2DResponse,
    IterationRecordOut,
    MethodId,
)

from .forward_dispatch import resolve_forward, resolve_jacobian
from .mesh import build_mesh
from .occam_chi2 import (
    chi2_reduced,
    chi2_target,
    data_sigma_log10,
    occam_lambda_step,
)
from .qc_weights import compute_data_weights
from .refine import build_adaptive_mesh
from .regularization import (
    hybrid_weights,
    huber_weights,
    l1_irls_weights,
    roughness_l2,
    roughness_matrix,
)


def _method_label(method: MethodId, forward: ForwardModelId) -> str:
    base = {
        "least_squares": "Mínimos quadrados",
        "occam": "Occam (χ² rigoroso)",
        "gauss_newton": "Gauss-Newton",
        "smoothness": "Suavizada L2",
        "robust_l1": "Robusta L1",
        "hybrid": "Híbrida L2/L1",
    }[method]
    solver = "FEM P1" if forward == "fem" else "FDM Poisson"
    return f"{base} ({solver})"


def _rms_log10(res: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(res))))


def _rms_percent(y_obs: np.ndarray, y_syn: np.ndarray) -> float:
    obs = 10.0 ** y_obs
    syn = 10.0 ** y_syn
    rel = np.abs(obs - syn) / np.maximum(obs, 1e-6)
    return float(np.mean(rel) * 100.0)


def _method_alpha(method: MethodId, req: Invert2DRequest) -> float:
    if method == "robust_l1":
        return 0.0
    if method == "hybrid":
        return float(req.params.hybrid_alpha)
    return 1.0


def _initial_model(y_obs: np.ndarray, nm: int) -> np.ndarray:
    base = float(np.mean(y_obs))
    return np.full(nm, base, dtype=float)


def _solve_normal(
    j: np.ndarray,
    res: np.ndarray,
    w: np.ndarray,
    r_mat: np.ndarray,
    lam: float,
    ridge: float = 1e-6,
) -> np.ndarray | None:
    nd, nm = j.shape
    wj = j * w[:, None]
    a = j.T @ wj + lam * r_mat
    a.flat[:: nm + 1] += ridge
    b = j.T @ (w * res)
    try:
        return np.linalg.solve(a, b)
    except np.linalg.LinAlgError:
        return None


def _iteration_step(
    m: np.ndarray,
    y_obs: np.ndarray,
    w: np.ndarray,
    r_mat: np.ndarray,
    lam: float,
    method: MethodId,
    req: Invert2DRequest,
    alpha_data: float,
    forward_fn,
    mesh,
    reading_dicts: list[dict],
    do_line_search: bool,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, float | None]:
    y_syn = forward_fn(m, mesh, reading_dicts)
    res = y_obs - y_syn

    if method == "robust_l1":
        w_eff = w * l1_irls_weights(res)
    elif method == "hybrid":
        w_eff = w * hybrid_weights(res, req.params.huber_c, alpha_data)
    else:
        w_eff = w * huber_weights(res, req.params.huber_c)

    j = resolve_jacobian(
        req.params.forward_model,
        req.params.jacobian_mode,
        m,
        mesh,
        reading_dicts,
    )
    dm = _solve_normal(j, res, w_eff, r_mat, lam)
    if dm is None:
        return m, y_syn, res, w_eff, None

    if do_line_search:
        for alpha in (1.0, 0.75, 0.5, 0.3):
            trial = m + alpha * dm
            trial_syn = forward_fn(trial, mesh, reading_dicts)
            trial_res = y_obs - trial_syn
            if _rms_log10(trial_res) <= _rms_log10(res):
                return trial, trial_syn, trial_res, w_eff, alpha
        m2 = m + 0.15 * dm
        y_syn2 = forward_fn(m2, mesh, reading_dicts)
        return m2, y_syn2, y_obs - y_syn2, w_eff, 0.15

    m2 = m + dm
    y_syn2 = forward_fn(m2, mesh, reading_dicts)
    return m2, y_syn2, y_obs - y_syn2, w_eff, 1.0


def run_invert_2d(req: Invert2DRequest) -> Invert2DResponse:
    if len(req.readings) < 4:
        raise ValueError("Mínimo 4 leituras para inversão física.")

    forward_model = req.params.forward_model
    forward_fn = resolve_forward(forward_model)
    engine_id = "physics_fem" if forward_model == "fem" else "physics_fdm"

    w_all, excluded = compute_data_weights(
        req.readings,
        auto_exclude_outliers=req.params.auto_exclude_outliers,
        outlier_score_threshold=req.params.outlier_score_threshold,
    )
    active_idx = [i for i in range(len(req.readings)) if i not in excluded]
    if len(active_idx) < 4:
        raise ValueError("QC removeu demasiadas leituras — mínimo 4 activas.")

    active_readings = [req.readings[i] for i in active_idx]
    w = w_all[active_idx]
    nd = len(active_readings)
    y_obs = np.array(
        [np.log10(max(r.rho_ohm_m, 1e-12)) for r in active_readings],
        dtype=float,
    )
    reading_dicts = [
        {
            "station_m": r.station_m,
            "n": r.n,
            "a_m": r.a_m,
            "i_ma": r.i_ma,
        }
        for r in active_readings
    ]

    xs = [r.station_m for r in active_readings]
    x0 = min(xs) - max(0.5, (max(xs) - min(xs)) * 0.05)
    x1 = max(xs) + max(0.5, (max(xs) - min(xs)) * 0.05)
    a_med = float(np.mean([r.a_m for r in active_readings]))
    n_max = max(r.n for r in active_readings)
    z_max = max(a_med * n_max * req.params.factor_depth * 1.35, a_med * 2.0)

    topo = None
    if req.topography:
        topo = [(p.station_m, p.elevation_m) for p in req.topography]

    if req.params.use_adaptive_mesh:
        mesh = build_adaptive_mesh(
            x0,
            x1,
            z_max,
            req.params.nx,
            req.params.nz,
            reading_dicts,
            topo,
            max_nx=min(48, req.params.nx + 12),
            max_nz=min(32, req.params.nz + 6),
        )
    else:
        mesh = build_mesh(x0, x1, z_max, req.params.nx, req.params.nz, topo)

    nm = mesh.nx * mesh.nz
    m = _initial_model(y_obs, nm)
    r_mat = roughness_matrix(mesh.nx, mesh.nz)
    sigma_data = data_sigma_log10(w, req.params.huber_c)
    target_chi2 = chi2_target(nd, req.params.target_chi2)
    chi2_tol = req.params.chi2_tolerance

    method = req.method
    lam = float(req.params.lambda_reg)
    history: list[IterationRecordOut] = []
    prev_phi: float | None = None
    alpha_data = _method_alpha(method, req)

    max_iter = 1 if method == "least_squares" else req.params.max_iter
    if method == "occam":
        lam = max(req.params.lambda_min, lam * 8.0)

    line_search_methods = ("gauss_newton", "occam", "smoothness", "robust_l1", "hybrid")

    for it in range(max_iter):
        m, y_syn, res, w_eff, _step = _iteration_step(
            m,
            y_obs,
            w,
            r_mat,
            lam,
            method,
            req,
            alpha_data,
            forward_fn,
            mesh,
            reading_dicts,
            method in line_search_methods,
        )

        rough = roughness_l2(m, mesh.nx, mesh.nz)
        chi2 = chi2_reduced(res, sigma_data)
        phi = float(np.sum(w_eff * np.square(res)) + lam * rough * rough)
        rel_gain = None if prev_phi is None or prev_phi <= 0 else (prev_phi - phi) / prev_phi
        history.append(
            IterationRecordOut(
                iter=it,
                rms_log10=_rms_log10(res),
                rms_percent=_rms_percent(y_obs, y_syn),
                lambda_reg=lam,
                phi=phi,
                roughness_l2=rough,
                relative_gain=rel_gain,
                chi2_reduced=chi2,
            )
        )
        prev_phi = phi

        if method == "occam":
            lam, converged = occam_lambda_step(
                chi2,
                target_chi2,
                chi2_tol,
                lam,
                req.params.lambda_min,
                req.params.lambda_decay,
            )
            if converged:
                break
        elif rel_gain is not None and rel_gain < req.params.min_improvement:
            break

    chi2_final = chi2_reduced(y_obs - y_syn, sigma_data)
    j_mode = "fd" if forward_model == "fem" else req.params.jacobian_mode
    mesh_mode = "adaptativa" if req.params.use_adaptive_mesh else "uniforme"
    solver = "FEM P1" if forward_model == "fem" else "FDM"

    return Invert2DResponse(
        ok=True,
        engine=engine_id,
        forward_model=forward_model,
        method=method,
        method_label=_method_label(method, forward_model),
        nx=mesh.nx,
        nz=mesh.nz,
        x_edges_m=mesh.x_edges.tolist(),
        z_edges_m=mesh.z_edges.tolist(),
        m_log10=m.tolist(),
        y_obs_log10=y_obs.tolist(),
        y_syn_log10=y_syn.tolist(),
        rms_log10=_rms_log10(y_obs - y_syn),
        rms_percent=_rms_percent(y_obs, y_syn),
        chi2_reduced=chi2_final,
        chi2_target=target_chi2,
        nd_data=nd,
        roughness_l2=roughness_l2(m, mesh.nx, mesh.nz),
        iterations=len(history),
        iteration_history=history,
        excluded_indices=excluded,
        data_weights=w_all.tolist(),
        message=(
            f"Inversão {solver} — malha {mesh_mode} {mesh.nx}×{mesh.nz}, "
            f"Jacobiana {j_mode}, χ²={chi2_final:.1f}/{target_chi2:.0f}, "
            f"Occam/GN/L1/L2 + QC"
        ),
    )

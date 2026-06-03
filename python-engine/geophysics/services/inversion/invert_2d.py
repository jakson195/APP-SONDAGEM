from __future__ import annotations

import logging
import os

import numpy as np

logger = logging.getLogger("geophysics.invert_2d")
_INVERT_DEBUG = os.environ.get("GEOPHYS_INVERT_DEBUG", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

from schemas.invert_2d import (
    ForwardModelId,
    Invert2DRequest,
    Invert2DResponse,
    IterationRecordOut,
    MethodId,
)

from .fdm_forward import (
    electrode_layout,
    estimate_fdm_k_2d_calibration,
    get_fdm_k_2d_calibration,
    set_fdm_k_2d_calibration,
)
from .forward_dispatch import resolve_jacobian
from .invert_forward import resolve_invert_forward
from .mesh import build_mesh
from .occam_chi2 import (
    chi2_reduced,
    chi2_target,
    data_sigma_log10,
    occam_lambda_step,
)
from .qc_weights import compute_data_weights
from .refine import build_adaptive_mesh
from .sensitivity_depth import column_sensitivity_depth_m
from .regularization import (
    blocky_reg_irls_matrix,
    hybrid_weights,
    huber_weights,
    l1_irls_weights,
    roughness_l2_anisotropic,
    roughness_matrix_anisotropic,
    scale_roughness_matrix,
)


def _method_label(method: MethodId, forward: ForwardModelId) -> str:
    base = {
        "least_squares": "Mínimos quadrados",
        "occam": "Occam (χ² rigoroso)",
        "gauss_newton": "Gauss-Newton",
        "smoothness": "Suavizada L2",
        "robust_l1": "Robusta L1 (IRLS)",
        "blocky_l1": "Blocky L1 (IRLS ∇m)",
        "hybrid": "Híbrida L2/L1",
    }[method]
    solver = "FEM P1" if forward == "fem" else "FDM Poisson"
    return f"{base} ({solver})"


def _rms_log10(res: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(res))))


def _rms_percent(y_obs: np.ndarray, y_syn: np.ndarray) -> float:
    """RMS relativo em %: sqrt(mean(((ρ_obs−ρ_syn)/ρ_obs)²))×100."""
    obs = 10.0 ** y_obs
    syn = 10.0 ** y_syn
    rel = (obs - syn) / np.maximum(obs, 1e-6)
    return float(np.sqrt(np.mean(np.square(rel))) * 100.0)


def _method_alpha(method: MethodId, req: Invert2DRequest) -> float:
    if method in ("robust_l1", "blocky_l1"):
        return 0.0
    if method == "hybrid":
        return float(req.params.hybrid_alpha)
    return 1.0


def _seed_model_from_readings(
    m: np.ndarray,
    mesh,
    reading_dicts: list[dict],
    y_obs: np.ndarray,
    factor_depth: float,
) -> np.ndarray:
    """Distribui log₁₀(ρa) observada nas células por coluna/profundidade (quebra simetria)."""
    from .mesh import idx

    nx, nz = mesh.nx, mesh.nz
    sums = np.zeros_like(m)
    counts = np.zeros_like(m)
    for k, r in enumerate(reading_dicts):
        station = float(r["station_m"])
        n = max(1, int(r["n"]))
        a = max(float(r["a_m"]), 0.5)
        z_cover = factor_depth * n * a
        i = int(
            np.clip(
                np.searchsorted(mesh.x_centers, station, side="left"),
                0,
                nx - 1,
            )
        )
        if mesh.x_centers[i] > station and i > 0:
            i -= 1
        for j in range(nz):
            if not mesh.active[i, j]:
                continue
            zc = float(mesh.z_centers[j])
            if zc > z_cover * 1.15:
                continue
            u = idx(i, j, nz)
            sums[u] += float(y_obs[k])
            counts[u] += 1.0
    for u in range(m.size):
        if counts[u] > 0:
            m[u] = sums[u] / counts[u]
    return m


def _initial_model(
    y_obs: np.ndarray,
    nm: int,
    mesh=None,
    reading_dicts: list[dict] | None = None,
    factor_depth: float = 0.286,
) -> np.ndarray:
    base = float(np.mean(y_obs))
    m = np.full(nm, base, dtype=float)
    if mesh is not None and reading_dicts:
        m = _seed_model_from_readings(m, mesh, reading_dicts, y_obs, factor_depth)
    rng = np.random.default_rng(0)
    m = m + rng.normal(0.0, 0.04, size=nm)
    return _clip_m(m)


# log10(ρ): ~0.1 a 100 000 Ω·m
M_LOG10_MIN = -1.0
M_LOG10_MAX = 5.0
DM_MAX_LOG10 = 0.85
DM_MAX_CELL_DEFAULT = 0.28
DM_MAX_CELL_BLOCKY = 0.22


def _clip_m(m: np.ndarray) -> np.ndarray:
    return np.clip(m, M_LOG10_MIN, M_LOG10_MAX)


def _limit_dm(dm: np.ndarray, method: MethodId = "gauss_newton") -> np.ndarray:
    """Limita Δm (Gauss-Newton: m_{k+1} = m_k + Δm) sem anular o passo."""
    if not np.all(np.isfinite(dm)):
        return np.zeros_like(dm)
    cell_cap = (
        DM_MAX_CELL_BLOCKY
        if method in ("blocky_l1", "robust_l1")
        else DM_MAX_CELL_DEFAULT
    )
    dm = np.clip(dm, -cell_cap, cell_cap)
    cap = DM_MAX_LOG10 * max(np.sqrt(dm.size), 1.0)
    nrm = float(np.linalg.norm(dm))
    if nrm > cap and nrm > 0:
        dm = dm * (cap / nrm)
    return dm


def _mask_dm_inactive(dm: np.ndarray, mesh) -> np.ndarray:
    """Não actualiza células inactivas na malha."""
    from .mesh import idx

    out = dm.copy()
    for i in range(mesh.nx):
        for j in range(mesh.nz):
            if not mesh.active[i, j]:
                out[idx(i, j, mesh.nz)] = 0.0
    return out


def _jacobian_diagnostics(j: np.ndarray) -> dict[str, float]:
    if j.size == 0:
        return {"j_cond": 0.0, "j_sv_max": 0.0, "j_sv_min": 0.0}
    try:
        s = np.linalg.svd(j, compute_uv=False)
        smax = float(s[0]) if s.size else 0.0
        smin = float(s[-1]) if s.size else 0.0
        cond = smax / max(smin, 1e-15)
    except np.linalg.LinAlgError:
        cond, smax, smin = 1e15, 0.0, 0.0
    return {"j_cond": cond, "j_sv_max": smax, "j_sv_min": smin}


def _model_rho_stats(m: np.ndarray) -> tuple[float, float, float]:
    rho = 10.0**m
    return float(rho.min()), float(rho.max()), float(np.std(rho))


def _log_iteration_debug(
    it: int,
    m: np.ndarray,
    j: np.ndarray,
    dm: np.ndarray | None,
    y_obs: np.ndarray,
    y_syn: np.ndarray,
    res: np.ndarray,
    lam: float,
    line_alpha: float | None = None,
) -> None:
    rho_m = 10.0**m
    obs_rho = 10.0**y_obs
    syn_rho = 10.0**y_syn
    dm_norm = float(np.linalg.norm(dm)) if dm is not None else 0.0
    dm_min = float(np.min(dm)) if dm is not None and dm.size else 0.0
    dm_max = float(np.max(dm)) if dm is not None and dm.size else 0.0
    jdiag = _jacobian_diagnostics(j)
    res_rho = obs_rho - syn_rho
    lines = [
        f"[invert iter {it}]",
        f"  model.min/max/std(rho): {rho_m.min():.2f} {rho_m.max():.2f} {float(np.std(rho_m)):.2f} Ohm.m",
        f"  rho_obs min/max: {obs_rho.min():.2f} / {obs_rho.max():.2f} Ohm.m",
        f"  rho_syn min/max: {syn_rho.min():.2f} / {syn_rho.max():.2f} Ohm.m",
        f"  residual rho min/max: {res_rho.min():.2f} / {res_rho.max():.2f} Ohm.m",
        f"  ||dm||={dm_norm:.3e}  dm.min/max={dm_min:.3e}/{dm_max:.3e}",
        f"  ||J||={np.linalg.norm(j):.3e}  J max|col|={float(np.max(np.linalg.norm(j, axis=0))):.3e}",
        f"  J cond={jdiag['j_cond']:.2e}  sv=[{jdiag['j_sv_min']:.2e},{jdiag['j_sv_max']:.2e}]",
        f"  rms_log10={_rms_log10(res):.5f}  rms%={_rms_percent(y_obs, y_syn):.2f}  lambda={lam:.4f}"
        + (f"  alpha={line_alpha:.2f}" if line_alpha is not None else ""),
    ]
    msg = "\n".join(lines)
    logger.info(msg)
    print(msg, flush=True)


def _solve_normal(
    j: np.ndarray,
    res: np.ndarray,
    w: np.ndarray,
    r_mat: np.ndarray,
    lam: float,
    ridge: float = 1e-8,
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


def _data_weights_for_method(
    method: MethodId,
    res: np.ndarray,
    w: np.ndarray,
    req: Invert2DRequest,
    alpha_data: float,
) -> np.ndarray:
    if method in ("robust_l1", "blocky_l1"):
        return w * l1_irls_weights(res)
    if method == "hybrid":
        return w * hybrid_weights(res, req.params.huber_c, alpha_data)
    return w * huber_weights(res, req.params.huber_c)


def _reg_matrix_for_step(
    method: MethodId,
    m: np.ndarray,
    r_base: np.ndarray,
    nx: int,
    nz: int,
    lx: float,
    lz: float,
) -> np.ndarray:
    if method == "blocky_l1":
        return blocky_reg_irls_matrix(m, nx, nz, lx, lz)
    return r_base


def _gauss_newton_update(
    m: np.ndarray,
    dm: np.ndarray,
    forward_fn,
    mesh,
    reading_dicts: list[dict],
    y_obs: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """m_{k+1} = m_k + Δm (Gauss-Newton regularizado, secção 3 do manual)."""
    m_new = _clip_m(m + dm)
    y_new = forward_fn(m_new, mesh, reading_dicts)
    return m_new, y_new, y_obs - y_new, 1.0


def _line_search_update(
    m: np.ndarray,
    dm: np.ndarray,
    y_obs: np.ndarray,
    y_syn0: np.ndarray,
    res0: np.ndarray,
    forward_fn,
    mesh,
    reading_dicts: list[dict],
    enabled: bool,
    trust_alpha: float = 0.35,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    dm_norm = float(np.linalg.norm(dm))
    if dm is None or dm_norm < 1e-14:
        return m, y_syn0, res0, 1.0

    if not enabled:
        return _gauss_newton_update(m, dm, forward_fn, mesh, reading_dicts, y_obs)

    best_alpha = 0.0
    best_obj = _rms_percent(y_obs, y_syn0)
    best_log = _rms_log10(res0)
    best_m, best_syn, best_res = m, y_syn0, res0

    for alpha in (1.0, 0.75, 0.5, 0.35, 0.25, 0.15, 0.1):
        trial = _clip_m(m + alpha * dm)
        trial_syn = forward_fn(trial, mesh, reading_dicts)
        trial_res = y_obs - trial_syn
        trial_pct = _rms_percent(y_obs, trial_syn)
        trial_log = _rms_log10(trial_res)
        improved = (
            trial_pct < best_obj - 1e-6
            or trial_log < best_log - 1e-6
            or (
                abs(trial_pct - best_obj) < 0.05 and trial_log < best_log - 1e-6
            )
        )
        if improved:
            best_obj = trial_pct
            best_log = trial_log
            best_alpha = alpha
            best_m, best_syn, best_res = trial, trial_syn, trial_res

    if best_alpha > 0:
        return best_m, best_syn, best_res, best_alpha

    for fallback_alpha in (0.5, 0.25, trust_alpha):
        m2 = _clip_m(m + fallback_alpha * dm)
        y_syn2 = forward_fn(m2, mesh, reading_dicts)
        res2 = y_obs - y_syn2
        if _rms_percent(y_obs, y_syn2) <= best_obj + 0.5:
            return m2, y_syn2, res2, fallback_alpha

    # Passo mínimo forçado: evita modelo preso no inicial (||dm||>0 mas α=0).
    forced = max(trust_alpha, 0.1)
    m_f = _clip_m(m + forced * dm)
    y_f = forward_fn(m_f, mesh, reading_dicts)
    syn_changed = float(np.linalg.norm(y_f - y_syn0)) > 1e-10
    if syn_changed or dm_norm > 1e-8:
        return m_f, y_f, y_obs - y_f, forced

    return m, y_syn0, res0, 0.0


def _iteration_step(
    m: np.ndarray,
    y_obs: np.ndarray,
    w: np.ndarray,
    r_base: np.ndarray,
    lam: float,
    method: MethodId,
    req: Invert2DRequest,
    alpha_data: float,
    forward_fn,
    mesh,
    reading_dicts: list[dict],
    do_line_search: bool,
) -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    float | None,
    np.ndarray,
    np.ndarray | None,
]:
    nx, nz = mesh.nx, mesh.nz
    lx = float(req.params.lambda_x)
    lz = float(req.params.lambda_z)
    inner_iters = (
        int(req.params.irls_inner_iters)
        if method in ("robust_l1", "blocky_l1")
        else 1
    )

    y_syn = forward_fn(m, mesh, reading_dicts)
    res = y_obs - y_syn
    j_mode = req.params.jacobian_mode
    dm_out: np.ndarray | None = None
    w_eff = w
    j = resolve_jacobian(
        req.params.forward_model,
        j_mode,
        m,
        mesh,
        reading_dicts,
        forward_fn=forward_fn,
    )

    for inner in range(inner_iters):
        r_mat = _reg_matrix_for_step(method, m, r_base, nx, nz, lx, lz)
        w_eff = _data_weights_for_method(method, res, w, req, alpha_data)
        if inner == inner_iters - 1:
            j = resolve_jacobian(
                req.params.forward_model,
                j_mode,
                m,
                mesh,
                reading_dicts,
                forward_fn=forward_fn,
            )
            dm = _solve_normal(j, res, w_eff, r_mat, lam)
            if dm is None:
                break
            dm = _mask_dm_inactive(_limit_dm(dm, method), mesh)
            dm_out = dm
            if _INVERT_DEBUG or inner_iters == 1:
                print(
                    f"  IRLS inner={inner} w_eff min/max={w_eff.min():.3e}/{w_eff.max():.3e} "
                    f"blocky={'yes' if method == 'blocky_l1' else 'no'}",
                    flush=True,
                )

    if dm_out is None:
        return m, y_syn, res, w_eff, None, j, None

    use_ls = do_line_search and req.params.use_line_search
    if method == "gauss_newton" and not use_ls:
        m_new, y_new, res_new, alpha = _gauss_newton_update(
            m, dm_out, forward_fn, mesh, reading_dicts, y_obs
        )
    else:
        m_new, y_new, res_new, alpha = _line_search_update(
            m,
            dm_out,
            y_obs,
            y_syn,
            res,
            forward_fn,
            mesh,
            reading_dicts,
            use_ls,
            trust_alpha=float(req.params.trust_region_alpha),
        )
    return _clip_m(m_new), y_new, res_new, w_eff, alpha, j, dm_out


def run_invert_2d(req: Invert2DRequest) -> Invert2DResponse:
    if len(req.readings) < 4:
        raise ValueError("Mínimo 4 leituras para inversão física.")

    forward_model = req.params.forward_model
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
    electrode_xs: list[float] = []
    for r in active_readings:
        layout = electrode_layout(r.station_m, r.n, r.a_m)
        electrode_xs.extend([layout.a_x, layout.b_x, layout.m_x, layout.n_x])
    x_min = min(min(xs), min(electrode_xs))
    x_max = max(max(xs), max(electrode_xs))
    span = max(x_max - x_min, 1.0)
    margin = max(0.5, span * 0.08)
    x0 = x_min - margin
    x1 = x_max + margin
    a_med = float(np.mean([r.a_m for r in active_readings]))
    n_max = max(r.n for r in active_readings)
    z_max = max(a_med * n_max * req.params.factor_depth, a_med * 2.0)

    topo = None
    if req.topography:
        topo = [(p.station_m, p.elevation_m) for p in req.topography]

    base_nx = max(req.params.nx, 16 if forward_model == "fdm" else 20)
    base_nz = max(req.params.nz, 10 if forward_model == "fdm" else 14)
    if req.params.use_adaptive_mesh:
        cap_nx = 40 if forward_model == "fem" else 52
        cap_nz = 28 if forward_model == "fem" else 36
        mesh = build_adaptive_mesh(
            x0,
            x1,
            z_max,
            base_nx,
            base_nz,
            reading_dicts,
            topo,
            max_nx=min(cap_nx, base_nx + 16),
            max_nz=min(cap_nz, base_nz + 10),
            apply_coverage_mask=req.params.apply_coverage_mask,
        )
    else:
        mesh = build_mesh(
            x0,
            x1,
            z_max,
            base_nx,
            base_nz,
            topo,
            geometric_z=True,
        )

    nm = mesh.nx * mesh.nz
    m = _initial_model(
        y_obs,
        nm,
        mesh=mesh,
        reading_dicts=reading_dicts,
        factor_depth=float(req.params.factor_depth),
    )
    k_2d_calib = 1.0
    if forward_model == "fdm":
        rho_ref = float(np.median(10.0**y_obs))
        k_2d_calib = estimate_fdm_k_2d_calibration(
            mesh, reading_dicts, rho_ref
        )
        set_fdm_k_2d_calibration(k_2d_calib)
    forward_fn = resolve_invert_forward(
        forward_model, m, mesh, reading_dicts, y_obs
    )
    calib_scale = float(getattr(forward_fn, "_scale_ohm", 1.0))
    y_syn0 = forward_fn(m, mesh, reading_dicts)
    lx = float(req.params.lambda_x)
    lz = float(req.params.lambda_z)
    r_mat = roughness_matrix_anisotropic(mesh.nx, mesh.nz, lx, lz)
    r_mat = scale_roughness_matrix(
        r_mat, nm, req.params.reg_normalize_mesh
    )
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

    line_search_methods = (
        "occam",
        "smoothness",
        "robust_l1",
        "blocky_l1",
        "hybrid",
    )
    if method == "gauss_newton":
        line_search_methods = ()  # passo completo m += Δm por defeito

    obs_rho = 10.0**y_obs
    n_active = int(np.sum(mesh.active))
    reg_kind = "blocky_IRLS" if method == "blocky_l1" else (
        "L1_IRLS" if method == "robust_l1" else "L2"
    )
    print(
        f"[invert start] method={method} ({reg_kind}) lambda={lam} lx={lx} lz={lz} "
        f"mesh={mesh.nx}x{mesh.nz} nm={nm} active={n_active} reg_norm={req.params.reg_normalize_mesh} "
        f"irls_inner={req.params.irls_inner_iters} k_2d={k_2d_calib:.3f} "
        f"scale_inv={float(getattr(forward_fn, '_scale_ohm', 1.0)):.3f} "
        f"jacobian={req.params.jacobian_mode} line_search={method in line_search_methods or req.params.use_line_search}",
        flush=True,
    )
    print(
        f"  rho_obs min/max/std: {obs_rho.min():.2f} {obs_rho.max():.2f} {float(np.std(obs_rho)):.2f}",
        flush=True,
    )

    y_syn_prev = y_syn0.copy()
    for it in range(max_iter):
        m, y_syn, res, w_eff, step_alpha, j_mat, dm_vec = _iteration_step(
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
        syn_delta = float(np.linalg.norm(y_syn - y_syn_prev))
        if _INVERT_DEBUG or it < 3:
            col_sens = (
                float(np.max(np.linalg.norm(j_mat, axis=0)))
                if j_mat is not None and j_mat.size
                else 0.0
            )
            print(
                f"  ||dy_syn||={syn_delta:.3e}  reg={reg_kind}  max|J_col|={col_sens:.3e}",
                flush=True,
            )
        y_syn_prev = y_syn.copy()
        _log_iteration_debug(it, m, j_mat, dm_vec, y_obs, y_syn, res, lam, step_alpha)

        rough = roughness_l2_anisotropic(m, mesh.nx, mesh.nz, lx, lz)
        chi2 = chi2_reduced(res, sigma_data)
        phi = float(np.sum(w_eff * np.square(res)) + lam * rough * rough)
        rel_gain = None if prev_phi is None or prev_phi <= 0 else (prev_phi - phi) / prev_phi
        rho_min, rho_max, rho_std = _model_rho_stats(m)
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
                rho_min_ohm_m=rho_min,
                rho_max_ohm_m=rho_max,
                rho_std_ohm_m=rho_std,
                dm_norm=float(np.linalg.norm(dm_vec)) if dm_vec is not None else None,
                j_norm=float(np.linalg.norm(j_mat)),
                line_search_alpha=step_alpha,
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
        elif (
            it + 1 >= req.params.min_iter_before_stop
            and rel_gain is not None
            and rel_gain < req.params.min_improvement
        ):
            break
        elif (
            it + 1 >= req.params.min_iter_before_stop
            and _rms_log10(res) <= req.params.target_rms_log10
        ):
            break

    if not np.all(np.isfinite(m)):
        finite = m[np.isfinite(m)]
        fill = float(np.mean(finite)) if finite.size else float(np.mean(y_obs))
        m = np.nan_to_num(
            m, nan=fill, posinf=M_LOG10_MAX, neginf=M_LOG10_MIN
        )
    m = _clip_m(m)

    chi2_final = chi2_reduced(y_obs - y_syn, sigma_data)
    rho_final = 10.0**m
    print(
        f"[invert done] rho_model min={rho_final.min():.2f} max={rho_final.max():.2f} "
        f"std={float(np.std(rho_final)):.2f} Ohm.m  "
        f"ratio={rho_final.max()/max(rho_final.min(),1e-6):.2f}  "
        f"rms%={_rms_percent(y_obs, y_syn):.2f}",
        flush=True,
    )
    j_mode = "fd" if forward_model == "fem" else req.params.jacobian_mode
    if forward_model == "fem" and req.params.use_adaptive_mesh:
        mesh_mode = "triangular adaptativa (P1)"
    elif req.params.use_adaptive_mesh:
        mesh_mode = "adaptativa"
    else:
        mesh_mode = "uniforme"
    solver = "FEM P1 triangular" if forward_model == "fem" else "FDM"

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
        active_cells=[
            bool(mesh.active[i, j])
            for i in range(mesh.nx)
            for j in range(mesh.nz)
        ],
        z_cover_m=column_sensitivity_depth_m(
            mesh, reading_dicts, req.params.factor_depth
        ).tolist(),
        y_obs_log10=y_obs.tolist(),
        y_syn_log10=y_syn.tolist(),
        rms_log10=_rms_log10(y_obs - y_syn),
        rms_percent=_rms_percent(y_obs, y_syn),
        chi2_reduced=chi2_final,
        chi2_target=target_chi2,
        nd_data=nd,
        roughness_l2=roughness_l2_anisotropic(m, mesh.nx, mesh.nz, lx, lz),
        iterations=len(history),
        iteration_history=history,
        excluded_indices=excluded,
        data_weights=w_all.tolist(),
        message=(
            f"Inversão {solver} — malha {mesh_mode} {mesh.nx}×{mesh.nz}, "
            f"Jacobiana {j_mode}, λ={lam}, χ²={chi2_final:.1f}/{target_chi2:.0f}"
        ),
    )

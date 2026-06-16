"""
Núcleo matemático de inversão 2D estilo RES2DINV.

- Parâmetro: m = ln(ρ) [Ω·m]
- Dados: d = log₁₀(ρa)
- Forward físico: FDM Poisson 2D ou FEM P1 (sem escala fake em log)
- Jacobiana: ∂d/∂m por diferenças finitas (sensibilidade física)
- GN / smoothness-constrained LS: (JᵀJ + λ WmᵀWm + μI) Δm = Jᵀ(d_obs − d_calc)
- Regularização espacial anisotrópica (λ_x horizontal, λ_z vertical)
- λ adaptativo + amortecimento LM (μ)
- Robusta opcional: IRLS L1 (dados e/ou modelo blocky)
- Preservação de heterogeneidade: λ baixo, passo m_new = m_old + Δm, sem normalizar J
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from schemas.invert_2d import (
    ForwardModelId,
    Invert2DRequest,
    Invert2DResponse,
    IterationRecordOut,
    MethodId,
)

from .adaptive_damping import AdaptiveDamping
from .adaptive_lambda import adaptive_lambda_step
from .fdm_forward import (
    electrode_layout,
    estimate_fdm_k_2d_calibration,
    set_fdm_k_2d_calibration,
)
from .forward_dispatch import resolve_jacobian
from .initial_model import build_initial_model_ln
from .invert_forward import resolve_invert_forward
from .mesh import Mesh2D, build_mesh, idx
from .model_units import clip_m_ln, m_ln_array_to_log10_rho
from .occam_chi2 import (
    chi2_reduced,
    chi2_target,
    data_sigma_log10,
    occam_lambda_step,
)
from .qc_weights import compute_data_weights
from .refine import build_adaptive_mesh
from .regularization import (
    blocky_reg_irls_matrix,
    hybrid_weights,
    l1_irls_weights,
    roughness_l2_anisotropic,
    roughness_matrix_anisotropic,
    scale_roughness_matrix,
)
from .sensitivity_depth import column_sensitivity_depth_m

logger = logging.getLogger("geophysics.res2dinv")
_DEBUG = os.environ.get("GEOPHYS_INVERT_DEBUG", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

ForwardFn = Callable[[np.ndarray, Mesh2D, list[dict]], np.ndarray]

# Smooth L2 puro → redireccionado para blocky (RES2DINV geológico)
_SMOOTH_LS_METHODS = frozenset({"gauss_newton", "smoothness", "least_squares"})
_ROBUST_BLOCKY_METHODS = frozenset({"robust_l1", "blocky_l1"})

DM_MAX_LN = 2.0
DM_MAX_CELL_GN = 0.75
DM_MAX_CELL_ROBUST = 0.65

_METHOD_LABEL = {
    "least_squares": "Mínimos quadrados",
    "occam": "Occam (χ²)",
    "gauss_newton": "Gauss-Newton",
    "smoothness": "Smoothness L2",
    "robust_l1": "Robusta L1",
    "blocky_l1": "Blocky L1",
    "hybrid": "Híbrida L2/L1",
}


def _method_label(method: MethodId, forward: ForwardModelId) -> str:
    solver = "FEM P1" if forward == "fem" else "FDM Poisson"
    return f"{_METHOD_LABEL[method]} ({solver})"


def _rms_log10(res: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(res))))


def _rms_percent(y_obs: np.ndarray, y_syn: np.ndarray) -> float:
    obs = 10.0 ** y_obs
    syn = 10.0 ** y_syn
    rel = (obs - syn) / np.maximum(obs, 1e-6)
    return float(np.sqrt(np.mean(np.square(rel))) * 100.0)


def _limit_dm(dm: np.ndarray, method: MethodId) -> np.ndarray:
    if not np.all(np.isfinite(dm)):
        return np.zeros_like(dm)
    cap_cell = (
        DM_MAX_CELL_ROBUST
        if method in ("blocky_l1", "robust_l1")
        else DM_MAX_CELL_GN
    )
    dm = np.clip(dm, -cap_cell, cap_cell)
    nrm = float(np.linalg.norm(dm))
    cap = DM_MAX_LN * max(np.sqrt(dm.size), 1.0)
    if nrm > cap and nrm > 0:
        dm = dm * (cap / nrm)
    return dm


def _mask_dm_inactive(dm: np.ndarray, mesh: Mesh2D) -> np.ndarray:
    out = dm.copy()
    for i in range(mesh.nx):
        for j in range(mesh.nz):
            if not mesh.active[i, j]:
                out[idx(i, j, mesh.nz)] = 0.0
    return out


def _build_spatial_regularization(
    mesh: Mesh2D,
    lambda_x: float,
    lambda_z: float,
    reg_normalize_mesh: bool,
) -> np.ndarray:
    """Operador smoothness WmᵀWm (λ_x horizontal + λ_z vertical); λ_reg aplicado no GN."""
    r = roughness_matrix_anisotropic(mesh.nx, mesh.nz, lambda_x, lambda_z)
    nm = mesh.nx * mesh.nz
    if reg_normalize_mesh:
        r = scale_roughness_matrix(r, nm, True)
    return r


def _data_weights(
    method: MethodId,
    res: np.ndarray,
    w: np.ndarray,
    huber_c: float,
    hybrid_alpha: float,
) -> np.ndarray:
    if method in ("gauss_newton", "smoothness", "least_squares"):
        return w
    if method in ("robust_l1", "blocky_l1"):
        return w * l1_irls_weights(res)
    if method == "hybrid":
        return w * hybrid_weights(res, huber_c, hybrid_alpha)
    from .regularization import huber_weights

    return w * huber_weights(res, huber_c)


def _resolve_inversion_method(method: MethodId) -> MethodId:
    if method in _SMOOTH_LS_METHODS:
        print(
            f"[res2dinv] method={method} -> blocky_l1 (robust/blocky, not smooth LS)",
            flush=True,
        )
        return "blocky_l1"
    return method


def _irls_inner_count(method: MethodId, requested: int) -> int:
    if method == "blocky_l1":
        return max(requested, 6)
    if method == "robust_l1":
        return max(requested, 4)
    return max(requested, 1)


def _reg_matrix_step(
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


def gauss_newton_solve(
    j: np.ndarray,
    residual: np.ndarray,
    r_mat: np.ndarray,
    lam: float,
    method: MethodId,
    data_weights: np.ndarray | None = None,
    mu: float = 0.0,
    ridge: float = 1e-9,
) -> np.ndarray | None:
    """
    Smoothness-constrained Gauss-Newton:
    (JᵀJ + λ WmᵀWm + μI) Δm = Jᵀ(d_obs − d_calc)
    """
    nd, nm = j.shape
    if method in ("gauss_newton", "smoothness", "least_squares"):
        a = j.T @ j + lam * r_mat
        b = j.T @ residual
    else:
        w = data_weights if data_weights is not None else np.ones(nd)
        wj = j * w[:, None]
        a = j.T @ wj + lam * r_mat
        b = j.T @ (w * residual)
    if mu > 0:
        a.flat[:: nm + 1] += mu
    a.flat[:: nm + 1] += ridge
    try:
        return np.linalg.solve(a, b)
    except np.linalg.LinAlgError:
        return None


@dataclass
class IterationContext:
    m: np.ndarray
    y_syn: np.ndarray
    residual: np.ndarray
    jacobian: np.ndarray
    dm: np.ndarray | None = None
    line_alpha: float = 1.0
    data_weights: np.ndarray = field(default_factory=lambda: np.array([]))


def _forward_update(
    m: np.ndarray,
    dm: np.ndarray,
    forward_fn: ForwardFn,
    mesh: Mesh2D,
    reading_dicts: list[dict],
    y_obs: np.ndarray,
    alpha: float = 1.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    m_new = clip_m_ln(m + alpha * dm)
    y_new = forward_fn(m_new, mesh, reading_dicts)
    return m_new, y_new, y_obs - y_new


def _line_search(
    m: np.ndarray,
    dm: np.ndarray,
    y_obs: np.ndarray,
    y_syn: np.ndarray,
    res: np.ndarray,
    forward_fn: ForwardFn,
    mesh: Mesh2D,
    reading_dicts: list[dict],
    trust_alpha: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    best = _rms_percent(y_obs, y_syn)
    best_m, best_syn, best_res = m, y_syn, res
    best_alpha = 0.0
    for alpha in (1.0, 0.75, 0.5, 0.35, 0.25, 0.15):
        m_t, y_t, r_t = _forward_update(
            m, dm, forward_fn, mesh, reading_dicts, y_obs, alpha
        )
        if _rms_percent(y_obs, y_t) < best - 1e-6:
            best = _rms_percent(y_obs, y_t)
            best_m, best_syn, best_res = m_t, y_t, r_t
            best_alpha = alpha
    if best_alpha > 0:
        return best_m, best_syn, best_res, best_alpha
    m_f, y_f, r_f = _forward_update(
        m, dm, forward_fn, mesh, reading_dicts, y_obs, max(trust_alpha, 0.15)
    )
    return m_f, y_f, r_f, max(trust_alpha, 0.15)


def res2dinv_iteration(
    ctx: IterationContext,
    *,
    y_obs: np.ndarray,
    w: np.ndarray,
    r_base: np.ndarray,
    lam: float,
    method: MethodId,
    req: Invert2DRequest,
    forward_fn: ForwardFn,
    mesh: Mesh2D,
    reading_dicts: list[dict],
    damping: AdaptiveDamping,
    use_line_search: bool,
) -> IterationContext:
    m = ctx.m
    lx = float(req.params.lambda_x)
    lz = float(req.params.lambda_z)
    inner = (
        int(req.params.irls_inner_iters)
        if method in ("robust_l1", "blocky_l1")
        else 1
    )
    y_syn = forward_fn(m, mesh, reading_dicts)
    res = y_obs - y_syn
    j_mode = req.params.jacobian_mode
    dm_out: np.ndarray | None = None
    w_eff = w

    for inner_k in range(inner):
        r_mat = _reg_matrix_step(method, m, r_base, mesh.nx, mesh.nz, lx, lz)
        w_eff = _data_weights(
            method,
            res,
            w,
            req.params.huber_c,
            float(req.params.hybrid_alpha),
        )
        if inner_k == inner - 1:
            j = resolve_jacobian(
                req.params.forward_model,
                j_mode,
                m,
                mesh,
                reading_dicts,
                forward_fn=forward_fn,
            )
            mu = damping.diagonal(m.size)
            dm = gauss_newton_solve(
                j,
                res,
                r_mat,
                lam,
                method,
                w_eff,
                mu=mu,
            )
            if dm is None:
                break
            dm = _mask_dm_inactive(_limit_dm(dm, method), mesh)
            dm_out = dm

    if dm_out is None:
        return IterationContext(
            m=m,
            y_syn=y_syn,
            residual=res,
            jacobian=np.zeros((len(y_obs), m.size)),
            dm=None,
            line_alpha=0.0,
            data_weights=w_eff,
        )

    phi_old = float(np.sum(w_eff * np.square(res)))
    if method == "gauss_newton" and not use_line_search:
        m_new, y_new, res_new = _forward_update(
            m, dm_out, forward_fn, mesh, reading_dicts, y_obs, 1.0
        )
        alpha = 1.0
    elif use_line_search:
        m_new, y_new, res_new, alpha = _line_search(
            m,
            dm_out,
            y_obs,
            y_syn,
            res,
            forward_fn,
            mesh,
            reading_dicts,
            float(req.params.trust_region_alpha),
        )
    else:
        m_new, y_new, res_new = _forward_update(
            m, dm_out, forward_fn, mesh, reading_dicts, y_obs, 1.0
        )
        alpha = 1.0

    phi_new = float(np.sum(w_eff * np.square(res_new)))
    damping.accept_step(phi_new, phi_old)

    return IterationContext(
        m=clip_m_ln(m_new),
        y_syn=y_new,
        residual=res_new,
        jacobian=j,
        dm=dm_out,
        line_alpha=alpha,
        data_weights=w_eff,
    )


def _prepare_mesh_and_data(req: Invert2DRequest) -> tuple[
    Mesh2D,
    np.ndarray,
    np.ndarray,
    list[dict],
    np.ndarray,
    list[int],
    ForwardFn,
    float,
]:
    w_all, excluded = compute_data_weights(
        req.readings,
        auto_exclude_outliers=req.params.auto_exclude_outliers,
        outlier_score_threshold=req.params.outlier_score_threshold,
    )
    active_idx = [i for i in range(len(req.readings)) if i not in excluded]
    if len(active_idx) < 4:
        raise ValueError("QC removeu demasiadas leituras — mínimo 4 activas.")

    active = [req.readings[i] for i in active_idx]
    w = w_all[active_idx]
    y_obs = np.array(
        [np.log10(max(r.rho_ohm_m, 1e-12)) for r in active],
        dtype=float,
    )
    reading_dicts = [
        {
            "station_m": r.station_m,
            "n": r.n,
            "a_m": r.a_m,
            "i_ma": r.i_ma,
        }
        for r in active
    ]

    xs = [r.station_m for r in active]
    electrode_xs: list[float] = []
    for r in active:
        layout = electrode_layout(r.station_m, r.n, r.a_m)
        electrode_xs.extend([layout.a_x, layout.b_x, layout.m_x, layout.n_x])
    from .invert_common import compute_profile_x_extent, compute_model_z_max_m

    x0, x1 = compute_profile_x_extent(xs, electrode_xs)
    z_max = compute_model_z_max_m(reading_dicts, req.params)

    topo = (
        [(p.station_m, p.elevation_m) for p in req.topography]
        if req.topography
        else None
    )
    fwd_model = req.params.forward_model
    base_nx = max(req.params.nx, 12 if fwd_model == "fdm" else 16)
    base_nz = max(req.params.nz, 8 if fwd_model == "fdm" else 10)

    if req.params.use_adaptive_mesh:
        mesh = build_adaptive_mesh(
            x0,
            x1,
            z_max,
            base_nx,
            base_nz,
            reading_dicts,
            topo,
            max_nx=min(52 if fwd_model == "fdm" else 40, base_nx + 16),
            max_nz=min(36 if fwd_model == "fdm" else 28, base_nz + 10),
            apply_coverage_mask=req.params.apply_coverage_mask,
        )
    else:
        mesh = build_mesh(x0, x1, z_max, base_nx, base_nz, topo, geometric_z=True)

    nm = mesh.nx * mesh.nz
    m = build_initial_model_ln(
        y_obs,
        nm,
        mesh=mesh,
        reading_dicts=reading_dicts,
        factor_depth=float(req.params.factor_depth),
    )

    k_2d = 1.0
    if fwd_model == "fdm":
        rho_ref = float(np.median(10.0**y_obs))
        k_2d = estimate_fdm_k_2d_calibration(mesh, reading_dicts, rho_ref)
        set_fdm_k_2d_calibration(k_2d)

    forward_fn = resolve_invert_forward(
        fwd_model,
        m,
        mesh,
        reading_dicts,
        y_obs,
        use_amplitude_scale=False,
    )
    return mesh, y_obs, w, reading_dicts, m, excluded, forward_fn, k_2d


def run_res2dinv_inversion(req: Invert2DRequest) -> Invert2DResponse:
    """Inversão física 2D completa (API RES2DINV)."""
    if len(req.readings) < 4:
        raise ValueError("Mínimo 4 leituras para inversão física.")

    forward_model = req.params.forward_model
    engine_id = "res2dinv_fem" if forward_model == "fem" else "res2dinv_fdm"

    mesh, y_obs, w, reading_dicts, m, excluded, forward_fn, k_2d = (
        _prepare_mesh_and_data(req)
    )

    lx = float(req.params.lambda_x)
    lz = float(req.params.lambda_z)
    r_base = _build_spatial_regularization(
        mesh,
        lx,
        lz,
        req.params.reg_normalize_mesh,
    )
    lam = float(req.params.lambda_reg)
    method = _resolve_inversion_method(req.method)
    nd = len(y_obs)
    sigma_data = data_sigma_log10(w, req.params.huber_c)
    target_chi2 = chi2_target(nd, req.params.target_chi2)
    chi2_tol = req.params.chi2_tolerance

    if method == "occam":
        lam = max(req.params.lambda_min, lam * 8.0)

    use_line_search = method in _ROBUST_BLOCKY_METHODS or method in (
        "occam",
        "hybrid",
    ) or bool(req.params.use_line_search)

    max_iter = 1 if method == "least_squares" else req.params.max_iter
    damping = AdaptiveDamping()
    history: list[IterationRecordOut] = []
    prev_phi: float | None = None

    reg_kind = (
        "blocky"
        if method == "blocky_l1"
        else "robust"
        if method == "robust_l1"
        else "smoothness"
    )
    print(
        f"[res2dinv] m=ln(rho) method={method} reg={reg_kind} "
        f"lam={lam} lam_x={lx} lam_z={lz} mesh={mesh.nx}x{mesh.nz} "
        f"k2d={k_2d:.2f} jacobian={req.params.jacobian_mode} "
        f"LM_mu={damping.mu:.2e}",
        flush=True,
    )

    ctx = IterationContext(
        m=m,
        y_syn=forward_fn(m, mesh, reading_dicts),
        residual=y_obs - forward_fn(m, mesh, reading_dicts),
        jacobian=np.zeros((nd, m.size)),
    )

    for it in range(max_iter):
        ctx = res2dinv_iteration(
            ctx,
            y_obs=y_obs,
            w=w,
            r_base=r_base,
            lam=lam,
            method=method,
            req=req,
            forward_fn=forward_fn,
            mesh=mesh,
            reading_dicts=reading_dicts,
            damping=damping,
            use_line_search=use_line_search,
        )

        rough = roughness_l2_anisotropic(ctx.m, mesh.nx, mesh.nz, lx, lz)
        chi2 = chi2_reduced(ctx.residual, sigma_data)
        phi = float(
            np.sum(ctx.data_weights * np.square(ctx.residual)) + lam * rough * rough
        )
        rel_gain = (
            None if prev_phi is None or prev_phi <= 0 else (prev_phi - phi) / prev_phi
        )
        rho = np.exp(ctx.m)
        history.append(
            IterationRecordOut(
                iter=it,
                rms_log10=_rms_log10(ctx.residual),
                rms_percent=_rms_percent(y_obs, ctx.y_syn),
                lambda_reg=lam,
                phi=phi,
                roughness_l2=rough,
                relative_gain=rel_gain,
                chi2_reduced=chi2,
                rho_min_ohm_m=float(rho.min()),
                rho_max_ohm_m=float(rho.max()),
                rho_std_ohm_m=float(np.std(rho)),
                dm_norm=float(np.linalg.norm(ctx.dm)) if ctx.dm is not None else None,
                j_norm=float(np.linalg.norm(ctx.jacobian)),
                line_search_alpha=ctx.line_alpha,
            )
        )
        prev_phi = phi

        if _DEBUG or it < 4:
            print(
                f"  iter {it} rms%={history[-1].rms_percent:.2f} "
                f"lam={lam:.4g} mu={damping.mu:.2e} "
                f"rho=[{rho.min():.0f},{rho.max():.0f}]",
                flush=True,
            )

        if method == "occam":
            lam, stop = occam_lambda_step(
                chi2,
                target_chi2,
                chi2_tol,
                lam,
                req.params.lambda_min,
                req.params.lambda_decay,
            )
            if stop:
                break
        elif req.params.adaptive_lambda:
            lam, stop = adaptive_lambda_step(
                chi2,
                target_chi2,
                chi2_tol,
                _rms_log10(ctx.residual),
                float(req.params.target_rms_log10),
                lam,
                req.params.lambda_min,
                req.params.lambda_decay,
                rel_gain,
                float(req.params.min_improvement),
                rms_percent=_rms_percent(y_obs, ctx.y_syn),
                target_rms_percent=float(req.params.target_rms_percent),
                min_iter=max(6, req.params.min_iter_before_stop),
                current_iter=it,
            )
            if stop:
                break
        elif (
            it + 1 >= req.params.min_iter_before_stop
            and rel_gain is not None
            and rel_gain < req.params.min_improvement
        ):
            break

    m_final = clip_m_ln(ctx.m)
    y_syn = ctx.y_syn
    chi2_final = chi2_reduced(y_obs - y_syn, sigma_data)
    syn_fit = float(
        np.median((10.0**y_syn) / np.maximum(10.0**y_obs, 1e-6))
    )
    rho_final = np.exp(m_final)

    mesh_mode = (
        "adaptativa"
        if req.params.use_adaptive_mesh
        else "uniforme"
    )
    solver = "FEM P1" if forward_model == "fem" else "FDM Poisson"

    print(
        f"[res2dinv done] rms%={_rms_percent(y_obs, y_syn):.2f} "
        f"rho_ratio={rho_final.max()/max(rho_final.min(),1e-6):.1f}",
        flush=True,
    )

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
        m_log10=m_ln_array_to_log10_rho(m_final).tolist(),
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
        roughness_l2=roughness_l2_anisotropic(m_final, mesh.nx, mesh.nz, lx, lz),
        iterations=len(history),
        iteration_history=history,
        excluded_indices=excluded,
        data_weights=w.tolist(),
        message=(
            f"RES2DINV {solver} — {mesh_mode} {mesh.nx}×{mesh.nz}, "
            f"m=ln(rho), GN+smoothness+LM, lam={lam:.4g}, "
            f"chi2={chi2_final:.1f}, rho_syn/rho_obs={syn_fit:.2f}"
        ),
    )

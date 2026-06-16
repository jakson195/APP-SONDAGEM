"""
Motor ERT 2D — FastAPI :8092

- Forward FDM: ∇·(σ∇φ) = −I δ(r − r_s)
- Jacobiana adjoint: J_ij = ∂log(ρa_i)/∂log(ρ_j)
- Gauss-Newton: (JᵀW_dJ + λCᵀC) Δm = JᵀW_d r  (m = log ρ)
- Regularização: L2 Tikhonov | L1 IRLS blocky | Occam (λ↓)
- Line search backtracking em cada iteração

Fallback legado (RES2DINV): GEOPHYS_ENGINE_LEGACY=1
"""

from __future__ import annotations

import os
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field, field_validator
from scipy.linalg import lstsq
from scipy.sparse import csr_matrix, diags

from fdm_core import (
    build_roughness_matrix,
    compute_jacobian_adjoint,
    forward_ln_data,
)
from legacy_bridge import ensure_legacy_path

MethodId = Literal["gauss_newton", "l2", "occam", "blocky_l1", "blocky"]
JacobianMode = Literal["adjoint", "fd"]

_METHOD_ALIASES: dict[str, MethodId] = {
    "l2": "gauss_newton",
    "tikhonov": "gauss_newton",
    "blocky": "blocky_l1",
}


class Measurement(BaseModel):
    a: float
    b: float
    m: float
    n: float
    pa: float = Field(gt=0, description="Resistividade aparente (Ω·m)")
    x: float | None = None
    z: float | None = None


class InversionRequest(BaseModel):
    """POST /invert — medições {a,b,m,n,pa} + parâmetros de inversão."""

    data: list[Measurement]
    method: MethodId = Field(
        default="gauss_newton",
        description="gauss_newton|l2 (Tikhonov suave), blocky_l1|blocky (L1 IRLS), occam (λ decrescente)",
    )
    lambda_reg: float = Field(default=10.0, ge=0)
    max_iter: int = Field(default=10, ge=1, le=40)
    convergence: float = Field(
        default=0.05,
        gt=0,
        description="RMS alvo do resíduo em log(ρa)",
    )
    electrode_spacing: float = Field(default=5.0, gt=0)
    jacobian_mode: JacobianMode = Field(
        default="adjoint",
        description="Ignorado no motor nativo — sempre adjoint (FD desactivado)",
    )

    @field_validator("method", mode="before")
    @classmethod
    def _normalize_method(cls, value: str) -> str:
        key = str(value).strip().lower()
        return _METHOD_ALIASES.get(key, key)


class InversionResponse(BaseModel):
    """Grade ρ(x,z), histórico RMS e convergência."""

    rho_model: list[list[float]] = Field(description="ρ [Ω·m], shape [nz][nx]")
    x_centers: list[float]
    z_centers: list[float]
    rms_history: list[float] = Field(description="RMS do resíduo log(ρa) por iteração")
    iterations: int
    converged: bool
    method: str
    message: str | None = None


def _rms(residual: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(residual))))


def _sigma_from_log_rho(log_rho: np.ndarray) -> np.ndarray:
    return np.exp(-log_rho)


def _forward_ln(
    log_rho: np.ndarray,
    measurements: list[Measurement],
    nx: int,
    nz: int,
    dx: float,
    dz: float,
    x0: float,
) -> np.ndarray:
    sigma = _sigma_from_log_rho(log_rho).reshape(nz, nx)
    return forward_ln_data(sigma, measurements, dx, dz, x0)


def _data_weights(measurements: list[Measurement]) -> np.ndarray:
    """W_d diagonal — uniforme se erro não fornecido."""
    w = np.ones(len(measurements), dtype=float)
    # Peso uniforme — sem informação de erro relativo, pesos iguais é correto
    # Evita escalar W_d por 1/ρa que suprime dados de alta resistividade
    for i, m in enumerate(measurements):
        _ = m  # peso = 1.0 para todos
    return np.diag(w)


def _solve_normal_system(
    j: np.ndarray,
    residual: np.ndarray,
    w_d: np.ndarray,
    c: csr_matrix,
    log_rho: np.ndarray,
    lam: float,
    method: MethodId,
) -> np.ndarray:
    """(JᵀW_dJ + λCᵀC) Δm = JᵀW_d r  ou IRLS blocky: λCᵀW_r²C."""
    n = log_rho.size
    jt_wd_j = j.T @ w_d @ j
    rhs = j.T @ w_d @ residual

    if method == "blocky_l1":
        cm = c @ log_rho
        eps = float(np.percentile(np.abs(cm), 10) + 1e-3)
        w_r = 1.0 / np.sqrt(cm * cm + eps * eps)
        ct_wr_c = (c.T @ diags(w_r) @ c).toarray()
        lhs = jt_wd_j + lam * ct_wr_c
    else:
        lhs = jt_wd_j + lam * (c.T @ c).toarray()

    lhs.flat[:: n + 1] += 1e-6
    delta_m, _, _, _ = lstsq(lhs, rhs)
    return np.asarray(delta_m, dtype=float).ravel()


def _line_search(
    log_rho: np.ndarray,
    delta_m: np.ndarray,
    d_obs: np.ndarray,
    measurements: list[Measurement],
    nx: int,
    nz: int,
    dx: float,
    dz: float,
    x0: float,
    rms: float,
) -> np.ndarray:
    alpha = 1.0
    best = log_rho
    for _ in range(8):
        trial = log_rho + alpha * delta_m
        d_new = _forward_ln(trial, measurements, nx, nz, dx, dz, x0)
        if _rms(d_obs - d_new) < rms:
            return trial
        alpha *= 0.5
    return best + alpha * delta_m


def _run_inversion_native(req: InversionRequest) -> InversionResponse:
    measurements = req.data

    x_coords = sorted(
        [m.a for m in measurements]
        + [m.b for m in measurements]
        + [m.m for m in measurements]
        + [m.n for m in measurements]
    )
    x_min, x_max = float(min(x_coords)), float(max(x_coords))
    margin = req.electrode_spacing * 3
    x_min -= margin
    x_max += margin

    nx = max(48, int((x_max - x_min) / req.electrode_spacing) + 1)
    nz = max(24, nx // 3)
    dx = (x_max - x_min) / (nx - 1)
    x0 = x_min

    # Profundidade máxima = maior nível dipolo-dipolo × a × fator Ps.Z
    # Nível n = separação entre dipolos AB e MN em unidades de 'a'
    # Para dipolo-dipolo: n = (dist_entre_centros_AB_MN / a) - 1
    # Profundidade investigação ≈ n_max × a × 0.519 × fator_extra
    a_sp = req.electrode_spacing
    dip_sep_max = max(
        abs(0.5*(m.m+m.n) - 0.5*(m.a+m.b))   # separação entre centros
        for m in measurements
    )
    n_max = max(1.0, dip_sep_max / a_sp - 0.5)
    z_max = max(
        n_max * a_sp * 0.519 * 2.2,   # Ps.Z × fator exploração
        a_sp * 4.0,                    # mínimo absoluto = 4 × espaçamento
    )
    dz = z_max / nz

    x_centers = [x0 + (ix + 0.5) * dx for ix in range(nx)]
    z_centers = [(iz + 0.5) * dz for iz in range(nz)]

    rho_0 = float(np.exp(np.mean(np.log([m.pa for m in measurements]))))
    log_rho = np.full(nx * nz, np.log(max(rho_0, 1e-3)), dtype=float)

    d_obs = np.log(np.array([m.pa for m in measurements], dtype=float))
    c = build_roughness_matrix(nx, nz, alpha_x=1.0, alpha_z=0.5)
    lam = float(req.lambda_reg)
    rms_history: list[float] = []

    w_d = _data_weights(measurements)
    method = req.method

    for _ in range(req.max_iter):
        sigma = _sigma_from_log_rho(log_rho).reshape(nz, nx)
        d_calc = forward_ln_data(sigma, measurements, dx, dz, x0)
        residual = d_obs - d_calc
        rms = _rms(residual)
        rms_history.append(rms)

        if rms < req.convergence:
            break

        # Adjunto: ~1 solve FDM por eletrodo (não por célula) — muito mais rápido que FD
        j = compute_jacobian_adjoint(sigma, measurements, dx, dz, x0)
        delta_m = _solve_normal_system(
            j, residual, w_d, c, log_rho, lam, method
        )
        log_rho = _line_search(
            log_rho,
            delta_m,
            d_obs,
            measurements,
            nx,
            nz,
            dx,
            dz,
            x0,
            rms,
        )
        log_rho = np.clip(log_rho, np.log(0.1), np.log(50_000.0))

        if method == "occam":
            lam = max(lam * 0.7, 0.1)

    rho_model = np.exp(log_rho).reshape(nz, nx)
    final_rms = rms_history[-1] if rms_history else 0.0
    converged = final_rms < req.convergence if rms_history else False

    reg_label = {
        "gauss_newton": "L2 Tikhonov",
        "blocky_l1": "L1 IRLS blocky",
        "occam": "Occam (λ decrescente)",
    }.get(method, method)

    return InversionResponse(
        rho_model=rho_model.tolist(),
        x_centers=x_centers,
        z_centers=z_centers,
        rms_history=rms_history,
        iterations=len(rms_history),
        converged=converged,
        method=method,
        message=(
            "FDM Poisson + Jacobiana adjoint; "
            f"{reg_label}; malha {nx}×{nz}; λ_final={lam:.3g}"
        ),
    )


def _measurement_to_reading(
    meas: Measurement,
    electrode_spacing: float,
) -> dict:
    """Converte posições a,b,m,n (m) em leitura dipolo-dipolo colinear."""
    a_pos, b_pos, m_pos, n_pos = meas.a, meas.b, meas.m, meas.n
    mn = sorted((m_pos, n_pos))
    a_m = max(mn[1] - mn[0], electrode_spacing * 0.25, 0.5)
    station_m = 0.5 * (mn[0] + mn[1])
    center_ab = 0.5 * (a_pos + b_pos)
    sep = abs(center_ab - station_m) - 0.5 * a_m
    n_level = max(1, int(round(sep / a_m))) if a_m > 0 else 1
    return {
        "station_m": meas.x if meas.x is not None else station_m,
        "n": n_level,
        "rho_ohm_m": float(meas.pa),
        "a_m": a_m,
        "excluded": False,
    }


def _map_lambda_reg(user_lambda: float) -> tuple[float, float, float]:
    scale = max(user_lambda, 1e-6) * 3e-4
    return scale, scale * 1.2, scale * 3.5


def _to_legacy_request(req: InversionRequest):
    ensure_legacy_path()
    from schemas.invert_2d import Invert2DRequest, InvertParamsIn, ReadingIn

    lam, lam_x, lam_z = _map_lambda_reg(req.lambda_reg)
    readings = [
        ReadingIn.model_validate(_measurement_to_reading(m, req.electrode_spacing))
        for m in req.data
    ]
    use_line_search = req.method != "gauss_newton"

    return Invert2DRequest(
        readings=readings,
        method=req.method,
        invert_engine="legacy",
        params=InvertParamsIn(
            lambda_reg=lam,
            lambda_x=lam_x,
            lambda_z=lam_z,
            max_iter=req.max_iter,
            target_rms_log10=req.convergence,
            target_rms_percent=max(req.convergence * 100.0, 1.0),
            use_line_search=use_line_search,
            adaptive_lambda=req.method != "gauss_newton",
            forward_model="fdm",
            jacobian_mode=req.jacobian_mode,
            auto_exclude_outliers=False,
        ),
    )


def _grid_centers(edges: list[float]) -> list[float]:
    e = np.asarray(edges, dtype=float)
    return ((e[:-1] + e[1:]) * 0.5).tolist()


def _rho_model_2d(m_log10: list[float], nx: int, nz: int) -> list[list[float]]:
    arr = np.asarray(m_log10, dtype=float).reshape(nx, nz)
    return (10.0**arr).T.tolist()


def _run_inversion_legacy(req: InversionRequest) -> InversionResponse:
    legacy_req = _to_legacy_request(req)
    from services.inversion.res2dinv_solver import run_res2dinv_inversion

    out = run_res2dinv_inversion(legacy_req)
    rms_history = [float(h.rms_log10) for h in out.iteration_history] or [
        float(out.rms_log10)
    ]
    final_rms = rms_history[-1]

    return InversionResponse(
        rho_model=_rho_model_2d(out.m_log10, out.nx, out.nz),
        x_centers=_grid_centers(out.x_edges_m),
        z_centers=_grid_centers(out.z_edges_m),
        rms_history=rms_history,
        iterations=int(out.iterations),
        converged=final_rms <= req.convergence,
        method=req.method,
        message=out.message,
    )


def run_inversion(req: InversionRequest) -> InversionResponse:
    if len(req.data) < 4:
        raise ValueError("Mínimo 4 medições para inversão ERT.")

    use_legacy = os.environ.get("GEOPHYS_ENGINE_LEGACY", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if use_legacy:
        return _run_inversion_legacy(req)
    return _run_inversion_native(req)

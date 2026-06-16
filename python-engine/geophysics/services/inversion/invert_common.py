"""
Utilitários partilhados pelos motores de inversão (pyGIMLi, SimPEG, legacy).
Garante o mesmo contrato JSON para a visualização Next.js.
"""

from __future__ import annotations

import numpy as np

from services.array_utils import writable
from schemas.invert_2d import (
    Invert2DRequest,
    Invert2DResponse,
    IterationRecordOut,
    MethodId,
)
from .fdm_forward import electrode_layout
from .mesh import Mesh2D, build_mesh, idx
from .qc_weights import compute_data_weights
from .sensitivity_depth import column_sensitivity_depth_m


def compute_profile_x_extent(
    xs: list[float],
    electrode_xs: list[float],
    *,
    origin_m: float = 0.0,
) -> tuple[float, float]:
    """
    Extensão horizontal do perfil para exibição.

    Alinha o início à estaca/chainage 0 quando o levantamento usa distâncias ≥ 0
    (SOLODATA / RES2DINV), em vez de x negativo por array dipolo-dipolo.
    """
    station_min = min(xs)
    station_max = max(xs)
    elec_min = min(electrode_xs)
    elec_max = max(electrode_xs)
    span = max(station_max - station_min, elec_max - elec_min, 1.0)
    margin = max(0.5, span * 0.08)
    x0 = min(station_min, elec_min) - margin
    if station_min >= origin_m - 1e-6:
        x0 = max(origin_m, x0)
    x1 = max(station_max, elec_max) + margin
    return float(x0), float(x1)


def prepare_inversion_data(
    req: Invert2DRequest,
) -> tuple[
    list,
    np.ndarray,
    np.ndarray,
    list[dict],
    list[int],
    float,
    float,
]:
    """Leituras activas pós-QC, y_obs log10, pesos, dicts, índices excluídos, x0, x1."""
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
    y_obs = writable(
        [np.log10(max(r.rho_ohm_m, 1e-12)) for r in active],
    )
    reading_dicts = [
        {
            "station_m": r.station_m,
            "n": r.n,
            "a_m": r.a_m,
            "rho_ohm_m": r.rho_ohm_m,
            "i_ma": r.i_ma or 50.0,
            "excluded": False,
        }
        for r in active
    ]

    xs = [r.station_m for r in active]
    electrode_xs: list[float] = []
    for r in active:
        ly = electrode_layout(r.station_m, r.n, r.a_m)
        electrode_xs.extend([ly.a_x, ly.b_x, ly.m_x, ly.n_x])
    x0, x1 = compute_profile_x_extent(xs, electrode_xs)
    return active, y_obs, w, reading_dicts, excluded, x0, x1


def compute_model_z_max_m(
    reading_dicts: list[dict],
    params,
) -> float:
    """Profundidade máxima do modelo (estilo RES2DINV): max(n·a) × factor × range."""
    factor = float(getattr(params, "model_depth_factor", 1.0) or 1.0)
    range_f = float(getattr(params, "model_depth_range", 1.05) or 1.05)
    z_max = 0.0
    for d in reading_dicts:
        z_max = max(z_max, factor * int(d["n"]) * float(d["a_m"]))
    a_vals = [float(d["a_m"]) for d in reading_dicts if float(d["a_m"]) > 0]
    a_med = float(np.mean(a_vals)) if a_vals else 5.0
    return max(z_max * range_f, a_med * 2.0)


def build_display_mesh(
    req: Invert2DRequest,
    x0: float,
    x1: float,
    reading_dicts: list[dict],
) -> Mesh2D:
    z_max = compute_model_z_max_m(reading_dicts, req.params)
    topo = (
        [(p.station_m, p.elevation_m) for p in req.topography]
        if req.topography
        else None
    )
    return build_mesh(
        x0,
        x1,
        z_max,
        req.params.nx,
        req.params.nz,
        topo,
        geometric_z=req.params.geometric_z_layers,
    )


def resample_rho_to_display_grid(
    interpolate_fn,
    display_mesh: Mesh2D,
    fill_log10: float = 2.0,
) -> np.ndarray:
    """Interpola ρ (Ω·m) para m_log10 na grelha nx×nz da UI."""
    m = np.full(display_mesh.nx * display_mesh.nz, fill_log10, dtype=float)
    for i in range(display_mesh.nx):
        for j in range(display_mesh.nz):
            if not display_mesh.active[i, j]:
                continue
            u = idx(i, j, display_mesh.nz)
            x = float(display_mesh.x_centers[i])
            z = float(display_mesh.z_centers[j])
            val = interpolate_fn(x, z)
            if np.isfinite(val) and val > 0:
                m[u] = float(np.log10(val))
    return writable(m)


def rms_metrics(y_obs: np.ndarray, y_syn: np.ndarray) -> tuple[float, float]:
    res = y_obs - y_syn
    rms_log10 = float(np.sqrt(np.mean(np.square(res))))
    obs_lin = 10.0**y_obs
    syn_lin = 10.0**y_syn
    rms_percent = float(
        np.sqrt(np.mean(np.square((obs_lin - syn_lin) / np.maximum(obs_lin, 1e-6))))
        * 100.0
    )
    return rms_log10, rms_percent


def build_invert_response(
    *,
    req: Invert2DRequest,
    engine: str,
    method: MethodId,
    method_label: str,
    forward_model: str,
    display_mesh: Mesh2D,
    m_log10: np.ndarray,
    y_obs: np.ndarray,
    y_syn: np.ndarray,
    reading_dicts: list[dict],
    excluded: list[int],
    data_weights: list[float],
    iterations: int,
    iteration_history: list[IterationRecordOut],
    lambda_reg: float,
    message: str,
    chi2_reduced: float | None = None,
    chi2_target: float | None = None,
    progress_log: list[str] | None = None,
) -> Invert2DResponse:
    rms_log10, rms_percent = rms_metrics(y_obs, y_syn)
    rho_cells = 10.0**m_log10
    finite = m_log10[np.isfinite(m_log10)]
    roughness = (
        float(np.std(np.diff(finite)))
        if finite.size > 1
        else 0.0
    )

    return Invert2DResponse(
        ok=True,
        engine=engine,
        forward_model=forward_model,  # type: ignore[arg-type]
        method=method,
        method_label=method_label,
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
            display_mesh, reading_dicts, req.params.factor_depth
        ).tolist(),
        y_obs_log10=y_obs.tolist(),
        y_syn_log10=y_syn.tolist(),
        rms_log10=rms_log10,
        rms_percent=rms_percent,
        chi2_reduced=chi2_reduced,
        chi2_target=chi2_target,
        nd_data=len(y_obs),
        roughness_l2=roughness,
        iterations=iterations,
        iteration_history=iteration_history,
        excluded_indices=excluded,
        data_weights=data_weights,
        message=message,
        progress_log=progress_log or [],
    )

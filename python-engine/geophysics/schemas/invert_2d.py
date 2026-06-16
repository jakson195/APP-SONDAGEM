from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ReadingIn(BaseModel):
    station_m: float
    n: int = Field(ge=1)
    rho_ohm_m: float = Field(gt=0)
    a_m: float = Field(gt=0)
    excluded: bool = False
    sp_mv: float | None = None
    v_mv: float | None = None
    i_ma: float | None = None
    qc_score: float | None = Field(default=None, ge=0, le=100)
    is_spike: bool = False


class TopographyPointIn(BaseModel):
    station_m: float
    elevation_m: float


ForwardModelId = Literal["fdm", "fem"]


class InvertParamsIn(BaseModel):
    nx: int = Field(default=32, ge=4, le=48)
    nz: int = Field(default=20, ge=4, le=32)
    factor_depth: float = Field(default=0.286, gt=0)
    lambda_reg: float = Field(
        default=0.03,
        ge=0,
        description="Escala global da regularização (Occam / GN); 0 = sem regularização",
    )
    lambda_x: float = Field(
        default=0.06,
        gt=0,
        description="Peso horizontal D_x (log₁₀ ρ) — menor = mais contraste lateral",
    )
    lambda_z: float = Field(
        default=0.15,
        gt=0,
        description="Peso vertical D_z — alto demais → modelo homogêneo por camadas",
    )
    reg_normalize_mesh: bool = Field(
        default=True,
        description="Divide R por nº de células (λ independente da malha)",
    )
    irls_inner_iters: int = Field(
        default=4,
        ge=1,
        le=12,
        description="Sub-iterações IRLS por passo (robust_l1 / blocky_l1)",
    )
    lambda_min: float = Field(default=0.02, gt=0)
    lambda_decay: float = Field(default=0.82, gt=0, le=1)
    max_iter: int = Field(default=20, ge=1, le=40)
    huber_c: float = Field(default=0.08, gt=0)
    min_improvement: float = Field(default=1e-4, ge=0)
    target_rms_log10: float = Field(default=0.035, gt=0)
    hybrid_alpha: float = Field(default=0.65, ge=0, le=1)
    outlier_score_threshold: float = Field(default=35.0, ge=0, le=100)
    auto_exclude_outliers: bool = True
    use_adaptive_mesh: bool = True
    apply_coverage_mask: bool = Field(
        default=False,
        description="Máscara trapezoidal na malha adaptativa (False = todas as células activas)",
    )
    geometric_z_layers: bool = True
    use_line_search: bool = Field(
        default=True,
        description="Busca em linha no passo Δm; gauss_newton usa passo completo se False",
    )
    trust_region_alpha: float = Field(
        default=0.35,
        gt=0,
        le=1,
        description="Passo mínimo forçado quando a busca em linha rejeita todos os α",
    )
    jacobian_mode: Literal["adjoint", "fd"] = "adjoint"
    forward_model: ForwardModelId = "fdm"
    target_chi2: float | None = Field(
        default=None,
        description="Alvo Occam; None = nd (número de dados)",
    )
    chi2_tolerance: float = Field(default=0.05, ge=0, le=0.5)
    min_iter_before_stop: int = Field(
        default=8,
        ge=1,
        le=30,
        description="Iterações mínimas antes de parar por ganho relativo",
    )


MethodId = Literal[
    "least_squares",
    "occam",
    "gauss_newton",
    "smoothness",
    "robust_l1",
    "blocky_l1",
    "hybrid",
]


class Invert2DRequest(BaseModel):
    readings: list[ReadingIn]
    params: InvertParamsIn = Field(default_factory=InvertParamsIn)
    method: MethodId = "robust_l1"
    topography: list[TopographyPointIn] | None = None


class IterationRecordOut(BaseModel):
    iter: int
    rms_log10: float
    rms_percent: float
    lambda_reg: float
    phi: float
    roughness_l2: float
    relative_gain: float | None = None
    chi2_reduced: float | None = None
    rho_min_ohm_m: float | None = None
    rho_max_ohm_m: float | None = None
    rho_std_ohm_m: float | None = None
    dm_norm: float | None = None
    j_norm: float | None = None
    line_search_alpha: float | None = None


class Invert2DResponse(BaseModel):
    ok: bool
    engine: str = "physics_fdm"
    forward_model: ForwardModelId = "fdm"
    method: MethodId
    method_label: str
    nx: int
    nz: int
    x_edges_m: list[float]
    z_edges_m: list[float]
    m_log10: list[float]
    active_cells: list[bool] = Field(default_factory=list)
    z_cover_m: list[float] = Field(default_factory=list)
    y_obs_log10: list[float]
    y_syn_log10: list[float]
    rms_log10: float
    rms_percent: float
    chi2_reduced: float | None = None
    chi2_target: float | None = None
    nd_data: int | None = None
    roughness_l2: float
    iterations: int
    iteration_history: list[IterationRecordOut]
    excluded_indices: list[int]
    data_weights: list[float]
    message: str | None = None

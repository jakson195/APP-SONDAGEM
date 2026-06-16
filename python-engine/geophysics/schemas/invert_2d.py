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

InvertEngineId = Literal["pygimli", "legacy", "simpeg", "resipy"]


class InvertParamsIn(BaseModel):
    nx: int = Field(default=22, ge=4, le=40)
    nz: int = Field(default=12, ge=4, le=24)
    factor_depth: float = Field(default=0.286, gt=0)
    model_depth_factor: float = Field(
        default=1.0,
        gt=0,
        description="Profundidade máx. modelo RES2DINV: factor × n × a",
    )
    model_depth_range: float = Field(
        default=1.05,
        gt=0,
        description="Extensão extra do modelo («model depth range» RES2DINV)",
    )
    lambda_reg: float = Field(
        default=0.0003,
        ge=0,
        description="Escala global da regularização (Occam / GN); 0 = sem regularização",
    )
    lambda_x: float = Field(
        default=0.0004,
        gt=0,
        description="Peso horizontal D_x (m = ln ρ) — menor = mais contraste lateral",
    )
    lambda_z: float = Field(
        default=0.0012,
        gt=0,
        description="Peso vertical D_z — alto demais → modelo homogêneo",
    )
    reg_normalize_mesh: bool = Field(
        default=False,
        description="Divide R por nº de células (desactivado = mais contraste RES2DINV)",
    )
    irls_inner_iters: int = Field(
        default=6,
        ge=1,
        le=12,
        description="Sub-iterações IRLS por passo (robust_l1 / blocky_l1)",
    )
    lambda_min: float = Field(default=0.02, gt=0)
    lambda_decay: float = Field(default=0.82, gt=0, le=1)
    max_iter: int = Field(default=5, ge=1, le=40)
    huber_c: float = Field(default=0.08, gt=0)
    min_improvement: float = Field(default=1e-4, ge=0)
    target_rms_log10: float = Field(default=0.05, gt=0)
    target_rms_percent: float = Field(
        default=12.0,
        gt=0,
        description="RMS relativo (%) alvo para parar inversão adaptativa",
    )
    hybrid_alpha: float = Field(default=0.65, ge=0, le=1)
    outlier_score_threshold: float = Field(default=35.0, ge=0, le=100)
    auto_exclude_outliers: bool = True
    use_adaptive_mesh: bool = False
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
    jacobian_mode: Literal["adjoint", "fd"] = Field(
        default="fd",
        description="Jacobiana: diferenças finitas (RES2DINV) ou adjoint (FDM rápido)",
    )
    adaptive_lambda: bool = Field(
        default=True,
        description="λ adaptativo (reduz λ enquanto χ²/RMS > alvo) — Gauss-Newton, smoothness, robust",
    )
    forward_model: ForwardModelId = "fdm"
    target_chi2: float | None = Field(
        default=None,
        description="Alvo Occam; None = nd (número de dados)",
    )
    chi2_tolerance: float = Field(default=0.05, ge=0, le=0.5)
    min_iter_before_stop: int = Field(
        default=3,
        ge=1,
        le=30,
        description="Iterações mínimas antes de parar por ganho relativo",
    )
    # --- Workflow ResIPy / RES2DINV ---
    rho_min_ohm_m: float = Field(default=0.1, gt=0, description="ρ mínima do modelo (Ω·m)")
    rho_max_ohm_m: float = Field(default=10_000.0, gt=0, description="ρ máxima do modelo (Ω·m)")
    mesh_type: Literal["trian", "quad"] = Field(default="trian")
    mesh_cl_factor: float = Field(default=5.0, gt=0, le=8)
    mesh_refine: int = Field(default=0, ge=0, le=4)
    mesh_fmd_m: float | None = Field(default=None, description="Fine mesh depth (m); None = auto")
    tolerance: float = Field(default=0.02, gt=0, le=0.5)
    a_wgt: float = Field(default=0.03, ge=0, le=1)
    b_wgt: float = Field(default=0.0, ge=0, le=1)
    filter_reciprocal: bool = True
    filter_negative: bool = True
    filter_duplicates: bool = True
    filter_pct_error: float | None = Field(default=15.0, ge=0, le=100)
    crop_corners: bool = Field(default=False, description="Máscara trapezoidal / cantos")
    doi_estimate: bool = False
    contour_smooth_sigma: float = Field(default=0.8, ge=0, le=3)
    contour_smooth_passes: int = Field(default=0, ge=0, le=6)
    fast_invert: bool = Field(
        default=True,
        description="Malha leve, poucas iterações, sem pós-processo pesado",
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
    method: MethodId = "blocky_l1"
    topography: list[TopographyPointIn] | None = None
    invert_engine: InvertEngineId | None = Field(
        default=None,
        description="pygimli (padrão), resipy, simpeg ou legacy (FDM/FEM interno). None = env GEOPHYS_INVERT_ENGINE",
    )


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
    engine: str = "pygimli"
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
    progress_log: list[str] = Field(default_factory=list)

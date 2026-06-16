"""Contratos API — inversão 2D ERT (estilo ResIPy / RES2DINV)."""

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
MethodId = Literal[
    "least_squares",
    "occam",
    "gauss_newton",
    "smoothness",
    "robust_l1",
    "blocky_l1",
    "hybrid",
]


class InvertParamsIn(BaseModel):
    nx: int = Field(default=22, ge=4, le=40)
    nz: int = Field(default=12, ge=4, le=24)
    factor_depth: float = Field(default=0.286, gt=0)
    lambda_reg: float = Field(default=0.0003, ge=0)
    lambda_x: float = Field(default=0.0004, gt=0)
    lambda_z: float = Field(default=0.0012, gt=0)
    reg_normalize_mesh: bool = False
    irls_inner_iters: int = Field(default=6, ge=1, le=12)
    lambda_min: float = Field(default=0.02, gt=0)
    lambda_decay: float = Field(default=0.82, gt=0, le=1)
    max_iter: int = Field(default=5, ge=1, le=40)
    huber_c: float = Field(default=0.08, gt=0)
    min_improvement: float = Field(default=1e-4, ge=0)
    target_rms_log10: float = Field(default=0.05, gt=0)
    target_rms_percent: float = Field(default=12.0, gt=0)
    hybrid_alpha: float = Field(default=0.65, ge=0, le=1)
    outlier_score_threshold: float = Field(default=35.0, ge=0, le=100)
    auto_exclude_outliers: bool = True
    use_adaptive_mesh: bool = False
    apply_coverage_mask: bool = False
    geometric_z_layers: bool = True
    use_line_search: bool = True
    trust_region_alpha: float = Field(default=0.35, gt=0, le=1)
    jacobian_mode: Literal["adjoint", "fd"] = "fd"
    adaptive_lambda: bool = True
    forward_model: ForwardModelId = "fdm"
    target_chi2: float | None = None
    chi2_tolerance: float = Field(default=0.05, ge=0, le=0.5)
    min_iter_before_stop: int = Field(default=3, ge=1, le=30)
    rho_min_ohm_m: float = Field(default=0.1, gt=0)
    rho_max_ohm_m: float = Field(default=10_000.0, gt=0)
    mesh_type: Literal["trian", "quad"] = "trian"
    mesh_cl_factor: float = Field(default=5.0, gt=0, le=8)
    mesh_refine: int = Field(default=0, ge=0, le=4)
    mesh_fmd_m: float | None = None
    tolerance: float = Field(default=0.02, gt=0, le=0.5)
    a_wgt: float = Field(default=0.03, ge=0, le=1)
    b_wgt: float = Field(default=0.0, ge=0, le=1)
    filter_reciprocal: bool = True
    filter_negative: bool = True
    filter_duplicates: bool = True
    filter_pct_error: float | None = Field(default=15.0, ge=0, le=100)
    crop_corners: bool = False
    doi_estimate: bool = False
    contour_smooth_sigma: float = Field(default=0.8, ge=0, le=3)
    contour_smooth_passes: int = Field(default=0, ge=0, le=6)
    fast_invert: bool = True


class Invert2DRequest(BaseModel):
    readings: list[ReadingIn]
    params: InvertParamsIn = Field(default_factory=InvertParamsIn)
    method: MethodId = "blocky_l1"
    topography: list[TopographyPointIn] | None = None
    invert_engine: InvertEngineId | None = None


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


class MeshRequest(BaseModel):
    readings: list[ReadingIn]
    params: InvertParamsIn = Field(default_factory=InvertParamsIn)
    topography: list[TopographyPointIn] | None = None


class MeshResponse(BaseModel):
    ok: bool
    nx: int
    nz: int
    x_edges_m: list[float]
    z_edges_m: list[float]
    active_cells: list[bool]
    z_cover_m: list[float]
    engine: str
    message: str | None = None


class ForwardRequest(BaseModel):
    readings: list[ReadingIn]
    m_log10: list[float]
    params: InvertParamsIn = Field(default_factory=InvertParamsIn)
    topography: list[TopographyPointIn] | None = None


class ForwardResponse(BaseModel):
    ok: bool
    y_syn_log10: list[float]
    message: str | None = None


class PseudoSectionRequest(BaseModel):
    readings: list[ReadingIn]
    factor_depth: float = 0.286


class PseudoPointOut(BaseModel):
    station_m: float
    n: int
    depth_m: float
    rho_ohm_m: float
    excluded: bool


class PseudoSectionResponse(BaseModel):
    ok: bool
    points: list[PseudoPointOut]
    rho_min: float
    rho_max: float

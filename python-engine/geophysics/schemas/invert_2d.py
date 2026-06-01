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
    nx: int = Field(default=24, ge=4, le=48)
    nz: int = Field(default=16, ge=4, le=32)
    factor_depth: float = Field(default=0.286, gt=0)
    lambda_reg: float = Field(default=8.0, gt=0)
    lambda_min: float = Field(default=0.05, gt=0)
    lambda_decay: float = Field(default=0.82, gt=0, le=1)
    max_iter: int = Field(default=12, ge=1, le=40)
    huber_c: float = Field(default=0.08, gt=0)
    min_improvement: float = Field(default=1e-4, ge=0)
    target_rms_log10: float = Field(default=0.035, gt=0)
    hybrid_alpha: float = Field(default=0.65, ge=0, le=1)
    outlier_score_threshold: float = Field(default=35.0, ge=0, le=100)
    auto_exclude_outliers: bool = True
    use_adaptive_mesh: bool = True
    jacobian_mode: Literal["adjoint", "fd"] = "adjoint"
    forward_model: ForwardModelId = "fdm"
    target_chi2: float | None = Field(
        default=None,
        description="Alvo Occam; None = nd (número de dados)",
    )
    chi2_tolerance: float = Field(default=0.05, ge=0, le=0.5)


MethodId = Literal[
    "least_squares",
    "occam",
    "gauss_newton",
    "smoothness",
    "robust_l1",
    "hybrid",
]


class Invert2DRequest(BaseModel):
    readings: list[ReadingIn]
    params: InvertParamsIn = Field(default_factory=InvertParamsIn)
    method: MethodId = "gauss_newton"
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

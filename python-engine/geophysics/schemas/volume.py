from typing import Literal

from pydantic import BaseModel, Field


class SamplePoint3D(BaseModel):
    x: float
    y: float
    z: float
    value: float = Field(description="log10(resistivity) or scalar geophysical property")


class VolumeBounds(BaseModel):
    min_x: float
    max_x: float
    min_y: float
    max_y: float
    max_z: float


class VolumeBuildRequest(BaseModel):
    sample_points: list[SamplePoint3D]
    bounds: VolumeBounds
    nx: int = Field(ge=8, le=120, default=40)
    ny: int = Field(ge=8, le=120, default=40)
    nz: int = Field(ge=8, le=80, default=20)
    method: Literal["idw", "kriging", "rbf"] = "idw"
    idw_power: float = Field(default=2.0, ge=0.5, le=5.0)
    max_influence_m: float = Field(default=80.0, ge=5.0)
    rbf_epsilon: float | None = None
    kriging_variogram: Literal["spherical", "exponential", "gaussian"] = "spherical"


class VolumeBuildResponse(BaseModel):
    log_rho: list[float]
    nx: int
    ny: int
    nz: int
    method: str
    sample_count: int
    valid_voxels: int

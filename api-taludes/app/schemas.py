from typing import Any, Literal

from pydantic import BaseModel, Field


RiskLevel = Literal["baixo", "medio", "alto"]
ChangeType = Literal["deslocamento", "erosao", "trinca", "instabilidade", "geral"]


class SurveyMeta(BaseModel):
    id: str
    label: str
    captured_at: str | None = None
    ortho_path: str | None = None
    dsm_path: str | None = None


class AnalysisRequest(BaseModel):
    survey_t0_id: str
    survey_t1_id: str
    threshold: float = Field(0.12, ge=0.01, le=0.99)
    min_area_px: int = Field(120, ge=10)
    max_points: int = Field(800, ge=10, le=5000)
    enable_optical_flow: bool = True
    enable_dsm_diff: bool = True
    enable_segmentation: bool = True


class AnalysisResultMeta(BaseModel):
    job_id: str
    ok: bool
    bounds: list[float]
    point_count: int
    vector_count: int
    risk_summary: dict[str, int]
    outputs: dict[str, str]
    message: str | None = None


class TemporalDashboardPoint(BaseModel):
    date: str
    risk_score: float
    risk_level: RiskLevel
    change_area_pct: float
    max_displacement_px: float


class TemporalDashboard(BaseModel):
    project_id: str
    points: list[TemporalDashboardPoint]


class ExportRequest(BaseModel):
    job_id: str
    formats: list[Literal["geojson", "geotiff", "las", "obj"]] = ["geojson"]

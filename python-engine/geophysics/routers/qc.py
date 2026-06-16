from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.qc_analysis import analyze_line_qc

router = APIRouter(prefix="/qc", tags=["qc"])


class QcLineRequest(BaseModel):
    stations_m: list[float]
    rho_ohm_m: list[float]
    time_series: list[float] | None = None
    sample_rate_hz: float | None = None


class QcLineResponse(BaseModel):
    grade: str
    snr: float
    spike_count: int
    spike_ratio: float
    amplitude_std: float
    amplitude_mean: float
    stability_cv: float
    max_abrupt_change: float
    spectral_noise_index: float
    power_line_50: float
    power_line_60: float
    residual: list[float]
    filtered: list[float]


@router.post("/analyze-line", response_model=QcLineResponse)
async def analyze_line(req: QcLineRequest) -> QcLineResponse:
    result = analyze_line_qc(
        req.stations_m,
        req.rho_ohm_m,
        req.time_series,
        req.sample_rate_hz,
    )
    return QcLineResponse(**result)

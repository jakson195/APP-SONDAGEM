from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class AlertLevel(str, Enum):
    info = "info"
    attention = "attention"
    danger = "danger"


class Trend(str, Enum):
    up = "up"
    down = "down"
    stable = "stable"


class StationOut(BaseModel):
    id: str
    name: str
    river: str
    level_m: float
    flood_stage_m: float
    trend: Trend
    lat: float
    lng: float
    flood_pct: float | None = None


class KpiSnapshot(BaseModel):
    current_level_m: float
    rain_24h_mm: float
    peak_predicted_m: float
    peak_eta_hours: int
    active_alerts: int
    model_rmse: float
    model_nse: float


class LevelPointOut(BaseModel):
    time: datetime
    observed: float | None = None
    predicted_6h: float | None = None
    predicted_12h: float | None = None
    predicted_24h: float | None = None
    rain_mm: float = 0.0


class RainHourOut(BaseModel):
    hour: datetime
    mm: float
    prob: float


class AlertOut(BaseModel):
    id: str
    level: AlertLevel
    title: str
    message: str
    station_id: str
    timestamp: datetime
    read: bool = False


class ModelMetricsOut(BaseModel):
    rmse: float
    nse: float
    architecture: str = "LSTM 2×128"
    horizons: list[str] = Field(default_factory=lambda: ["6h", "12h", "24h"])


class DashboardOut(BaseModel):
    basin_name: str
    primary_station_id: str
    updated_at: datetime
    kpis: KpiSnapshot
    stations: list[StationOut]
    level_series: list[LevelPointOut]
    rain_forecast: list[RainHourOut]
    alerts: list[AlertOut]
    model_metrics: ModelMetricsOut


class WsMessage(BaseModel):
    type: Literal["dashboard", "alert", "ping"]
    payload: dict

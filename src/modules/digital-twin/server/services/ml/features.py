"""Extração de features multi-fonte para previsão de deformação."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import mean, pstdev
from uuid import UUID


@dataclass
class PointFeatures:
    displacement_id: UUID
    lon: float
    lat: float
    displacement_mm: float
    velocity_mm_yr: float | None
    coherence: float | None
    insar_series: list[tuple[float, float]] = field(default_factory=list)
    rain_7d_mm: float = 0.0
    rain_30d_mm: float = 0.0
    gnss_velocity_mm_yr: float = 0.0
    iot_anomaly: float = 0.0


def _days_since_epoch(d: date, epoch: date) -> float:
    return float((d - epoch).days)


def build_insar_series(
    rows: list[tuple[date, float]],
) -> tuple[list[tuple[float, float]], float | None, float | None]:
    """Retorna série (dias, mm), velocidade estimada (mm/ano) e aceleração relativa."""
    if not rows:
        return [], None, None
    rows = sorted(rows, key=lambda r: r[0])
    epoch = rows[0][0]
    series = [(_days_since_epoch(d, epoch), v) for d, v in rows]
    if len(series) < 2:
        return series, None, None
    xs = [s[0] for s in series]
    ys = [s[1] for s in series]
    n = len(xs)
    x_mean = sum(xs) / n
    y_mean = sum(ys) / n
    num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(n))
    den = sum((xs[i] - x_mean) ** 2 for i in range(n)) or 1e-9
    slope_per_day = num / den
    velocity_mm_yr = slope_per_day * 365.25
    if len(series) >= 3:
        mid = n // 2
        v1 = (ys[mid] - ys[0]) / max(xs[mid] - xs[0], 1e-6)
        v2 = (ys[-1] - ys[mid]) / max(xs[-1] - xs[mid], 1e-6)
        accel = abs(v2 - v1) * 365.25
    else:
        accel = abs(velocity_mm_yr) * 0.1
    return series, velocity_mm_yr, accel


def rain_totals(
    observations: list[tuple[datetime, float]],
    *,
    ref: datetime,
) -> tuple[float, float]:
    t7 = ref - timedelta(days=7)
    t30 = ref - timedelta(days=30)
    r7 = sum(v for t, v in observations if t >= t7)
    r30 = sum(v for t, v in observations if t >= t30)
    return r7, r30


def gnss_velocity(observations: list[tuple[datetime, float]]) -> float:
    if len(observations) < 2:
        return 0.0
    observations = sorted(observations, key=lambda x: x[0])
    dt_days = (observations[-1][0] - observations[0][0]).total_seconds() / 86400
    if dt_days < 1:
        return 0.0
    delta = observations[-1][1] - observations[0][1]
    return delta / dt_days * 365.25


def iot_anomaly_score(observations: list[tuple[datetime, float]]) -> float:
    if len(observations) < 3:
        return 0.0
    values = [v for _, v in observations[-30:]]
    mu = mean(values)
    sigma = pstdev(values) or 1e-6
    z = abs(values[-1] - mu) / sigma
    return min(1.0, z / 3.0)

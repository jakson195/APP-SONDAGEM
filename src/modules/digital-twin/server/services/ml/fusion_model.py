"""
Modelo de fusão v1 — combina InSAR, chuva, GNSS e IoT.

Previsão de deslocamento: extrapolação linear da série InSAR + termo pluviométrico.
Risco de ruptura: função logística sobre velocidade, aceleração, chuva e anomalia IoT.
Mapa de probabilidade: kernel gaussiano sobre pontos de falha.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from app.services.ml.features import PointFeatures


MODEL_VERSION = "fusion-v1"

WEIGHTS_RUPTURE = {
    "velocity": 0.35,
    "acceleration": 0.25,
    "rain_30d": 0.20,
    "iot": 0.12,
    "coherence": 0.08,
}
RAIN_COEFF_MM_PER_MM = 0.15


@dataclass
class PointPrediction:
    forecast_displacement_mm: float
    rupture_risk: float
    failure_probability: float
    confidence: float
    velocity_mm_yr: float
    acceleration_mm_yr2: float


def _sigmoid(x: float) -> float:
    x = max(-20.0, min(20.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def _normalize(value: float, scale: float) -> float:
    return value / scale if scale > 0 else 0.0


def _velocity_accel(series: list[tuple[float, float]]) -> tuple[float, float]:
    if len(series) < 2:
        return 0.0, 0.0
    xs = np.array([s[0] for s in series], dtype=float)
    ys = np.array([s[1] for s in series], dtype=float)
    coef = np.polyfit(xs, ys, 1)
    velocity = float(coef[0] * 365.25)
    if len(series) >= 3:
        mid = len(xs) // 2
        v1 = (ys[mid] - ys[0]) / max(xs[mid] - xs[0], 1e-6)
        v2 = (ys[-1] - ys[mid]) / max(xs[-1] - xs[mid], 1e-6)
        accel = abs(float((v2 - v1) * 365.25))
    else:
        accel = abs(velocity) * 0.15
    return velocity, accel


class FusionDeformationModel:
    version: str = MODEL_VERSION

    def predict_point(
        self,
        features: PointFeatures,
        *,
        horizon_days: int,
    ) -> PointPrediction:
        series = features.insar_series
        if not series:
            series = [(0.0, features.displacement_mm)]

        velocity = features.velocity_mm_yr
        accel = 0.0
        if len(series) >= 2:
            v_est, a_est = _velocity_accel(series)
            velocity = v_est if velocity is None else velocity
            accel = a_est
        else:
            velocity = velocity or 0.0
            accel = abs(velocity) * 0.1

        current_mm = series[-1][1]
        rain_term = RAIN_COEFF_MM_PER_MM * features.rain_30d_mm
        gnss_term = 0.25 * features.gnss_velocity_mm_yr * (horizon_days / 365.25)
        forecast = current_mm + velocity * (horizon_days / 365.25) + rain_term + gnss_term

        coh_penalty = 0.0
        if features.coherence is not None and features.coherence < 0.5:
            coh_penalty = (0.5 - features.coherence) * 2.0

        logit = (
            WEIGHTS_RUPTURE["velocity"] * _normalize(abs(velocity), 15.0)
            + WEIGHTS_RUPTURE["acceleration"] * _normalize(accel, 10.0)
            + WEIGHTS_RUPTURE["rain_30d"] * _normalize(features.rain_30d_mm, 120.0)
            + WEIGHTS_RUPTURE["iot"] * features.iot_anomaly
            + WEIGHTS_RUPTURE["coherence"] * coh_penalty
            - 1.2
        )
        rupture_risk = _sigmoid(logit * 4.0)
        failure_prob = _sigmoid((logit + _normalize(abs(forecast), 25.0) * 0.4) * 3.5)

        n_obs = len(series) + (1 if features.rain_30d_mm > 0 else 0)
        confidence = min(
            0.95,
            0.35
            + 0.1 * n_obs
            + (0.2 if features.coherence and features.coherence > 0.5 else 0),
        )

        return PointPrediction(
            forecast_displacement_mm=float(forecast),
            rupture_risk=float(rupture_risk),
            failure_probability=float(failure_prob),
            confidence=float(confidence),
            velocity_mm_yr=float(velocity),
            acceleration_mm_yr2=float(accel),
        )


def build_probability_grid(
    points: list[tuple[float, float, float]],
    *,
    bounds: tuple[float, float, float, float],
    grid_size: int = 24,
    sigma_deg: float = 0.02,
) -> list[dict]:
    """Gera células (lon, lat, failure_probability) para mapa de probabilidade."""
    min_lon, min_lat, max_lon, max_lat = bounds
    if min_lon >= max_lon or min_lat >= max_lat or not points:
        return []

    lons = np.linspace(min_lon, max_lon, grid_size)
    lats = np.linspace(min_lat, max_lat, grid_size)
    plons = np.array([p[0] for p in points])
    plats = np.array([p[1] for p in points])
    probs = np.array([p[2] for p in points])

    cells: list[dict] = []
    for lon in lons:
        for lat in lats:
            d2 = (plons - lon) ** 2 + (plats - lat) ** 2
            w = np.exp(-d2 / (2 * sigma_deg**2))
            if w.sum() < 1e-9:
                continue
            p = float(np.sum(w * probs) / np.sum(w))
            cells.append(
                {
                    "lon": float(lon),
                    "lat": float(lat),
                    "failure_probability": p,
                    "rupture_risk": p,
                }
            )
    return cells

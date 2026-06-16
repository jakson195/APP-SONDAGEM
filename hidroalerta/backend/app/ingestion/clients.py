"""Clientes de ingestão — ANA HidroWeb e OpenMeteo."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _openmeteo_fallback() -> tuple[float, list[dict]]:
    """Fallback dev quando OpenMeteo/SSL indisponível."""
    import random
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    rain_24h = round(40 + random.random() * 15, 1)
    forecast: list[dict] = []
    for i in range(36):
        peak = 8 <= i <= 18
        forecast.append(
            {
                "hour": now + timedelta(hours=i),
                "mm": round(2 + random.random() * 8, 2) if peak else round(random.random() * 1.5, 2),
                "prob": round(60 + random.random() * 35, 1) if peak else round(10 + random.random() * 40, 1),
            }
        )
    return rain_24h, forecast


async def fetch_openmeteo_rain_mm(lat: float, lng: float) -> tuple[float, list[dict]]:
    """
    Chuva acumulada 24h + previsão horária (mm).
    https://open-meteo.com/en/docs
    """
    params = {
        "latitude": lat,
        "longitude": lng,
        "hourly": "precipitation,precipitation_probability",
        "past_days": 1,
        "forecast_days": 2,
        "timezone": "America/Sao_Paulo",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(settings.openmeteo_url, params=params)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as exc:
        logger.warning("OpenMeteo indisponível (%s) — fallback simulado", exc)
        return _openmeteo_fallback()

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    precip = hourly.get("precipitation", [])
    probs = hourly.get("precipitation_probability", [])

    now = datetime.now(timezone.utc)
    rain_24h = 0.0
    forecast: list[dict] = []

    for i, t in enumerate(times):
        mm = float(precip[i] or 0)
        prob = float(probs[i] or 0) if i < len(probs) else 0.0
        ts = datetime.fromisoformat(t.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if (now - ts).total_seconds() <= 86400 and ts <= now:
            rain_24h += mm
        if ts >= now and len(forecast) < 36:
            forecast.append({"hour": ts, "mm": round(mm, 2), "prob": prob})

    return round(rain_24h, 1), forecast


async def fetch_hidroweb_levels() -> dict[str, float]:
    """
    Placeholder ANA HidroWeb — substituir por API/SOAP real ou export CSV.
    Retorna níveis simulados com pequena variação.
    """
    logger.info("HidroWeb: usando dados simulados (integração ANA pendente)")
    import random

    base = {
        "st-ita-01": 8.42,
        "st-ita-02": 6.18,
        "st-ita-03": 4.05,
        "st-ita-04": 3.21,
    }
    return {k: round(v + (random.random() - 0.5) * 0.15, 2) for k, v in base.items()}

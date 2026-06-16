"""Estado em memória — substituído por PostgreSQL quando USE_DATABASE=true."""

from __future__ import annotations

import math
import random
import uuid
from datetime import datetime, timedelta, timezone
from threading import Lock

from app.schemas import (
    AlertLevel,
    AlertOut,
    DashboardOut,
    KpiSnapshot,
    LevelPointOut,
    ModelMetricsOut,
    RainHourOut,
    StationOut,
    Trend,
)

BASIN_NAME = "Bacia do Rio Itajaí-Açu"
PRIMARY_STATION_ID = "st-ita-01"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AppState:
    def __init__(self) -> None:
        self._lock = Lock()
        self.updated_at = _utcnow()
        self.stations: list[dict] = [
            {
                "id": "st-ita-01",
                "name": "Blumenau — Ponte da Vila",
                "river": "Itajaí-Açu",
                "level_m": 8.42,
                "flood_stage_m": 10.0,
                "trend": "up",
                "lat": -26.9194,
                "lng": -49.0661,
            },
            {
                "id": "st-ita-02",
                "name": "Gaspar — BR-470",
                "river": "Itajaí-Açu",
                "level_m": 6.18,
                "flood_stage_m": 9.5,
                "trend": "up",
                "lat": -26.9314,
                "lng": -48.9589,
            },
            {
                "id": "st-ita-03",
                "name": "Indaial — Centro",
                "river": "Itajaí-Açu",
                "level_m": 4.05,
                "flood_stage_m": 8.0,
                "trend": "stable",
                "lat": -26.8978,
                "lng": -49.2317,
            },
            {
                "id": "st-ita-04",
                "name": "Apiúna — Ponte",
                "river": "Itajaí-Açu",
                "level_m": 3.21,
                "flood_stage_m": 7.2,
                "trend": "down",
                "lat": -27.0375,
                "lng": -49.3889,
            },
        ]
        self.rain_24h_mm = 47.3
        self.peak_predicted_m = 9.85
        self.peak_eta_hours = 14
        self.model_rmse = 0.34
        self.model_nse = 0.91
        self.alerts: list[dict] = self._seed_alerts()
        self.level_series = self._seed_level_series()
        self.rain_forecast = self._seed_rain_forecast()

    def _seed_alerts(self) -> list[dict]:
        now = _utcnow()
        return [
            {
                "id": "a1",
                "level": AlertLevel.attention,
                "title": "Nível em ascensão",
                "message": "Blumenau atinge 84% da cota. Pico previsto em ~14h.",
                "station_id": PRIMARY_STATION_ID,
                "timestamp": now - timedelta(minutes=12),
                "read": False,
            },
            {
                "id": "a2",
                "level": AlertLevel.danger,
                "title": "Risco de transbordamento",
                "message": "LSTM 24h: 9,85 m (> cota 10,0 m). HEC-RAS acionado.",
                "station_id": PRIMARY_STATION_ID,
                "timestamp": now - timedelta(minutes=45),
                "read": False,
            },
            {
                "id": "a3",
                "level": AlertLevel.info,
                "title": "Ingestão ANA concluída",
                "message": "HidroWeb — 4 estações actualizadas.",
                "station_id": PRIMARY_STATION_ID,
                "timestamp": now - timedelta(hours=2),
                "read": True,
            },
        ]

    def _seed_level_series(self) -> list[dict]:
        out: list[dict] = []
        now = _utcnow()
        for i in range(48):
            h = 47 - i
            base = 6.8 + math.sin(i / 6) * 0.8
            rain = (i - 30) * 0.15 if i > 30 else 0
            observed = base + rain + (random.random() - 0.5) * 0.2 if i >= 6 else None
            future = base + rain * 1.2 if i < 6 else None
            out.append(
                {
                    "time": now - timedelta(hours=h),
                    "observed": round(observed, 3) if observed is not None else None,
                    "predicted_6h": round(future + 0.3, 3) if future else None,
                    "predicted_12h": round(future + 0.55, 3) if future else None,
                    "predicted_24h": round(future + 0.9, 3) if future else None,
                    "rain_mm": max(0, (i - 28) * 1.8 + random.random() * 2)
                    if i > 28
                    else random.random() * 0.5,
                }
            )
        return out

    def _seed_rain_forecast(self) -> list[dict]:
        out: list[dict] = []
        now = _utcnow()
        for i in range(36):
            peak = 8 <= i <= 18
            out.append(
                {
                    "hour": now + timedelta(hours=i),
                    "mm": round(2 + random.random() * 8, 2) if peak else round(random.random() * 1.5, 2),
                    "prob": round(60 + random.random() * 35, 1) if peak else round(10 + random.random() * 40, 1),
                }
            )
        return out

    def primary_station(self) -> dict:
        for s in self.stations:
            if s["id"] == PRIMARY_STATION_ID:
                return s
        return self.stations[0]

    def station_out(self, raw: dict) -> StationOut:
        pct = round(raw["level_m"] / raw["flood_stage_m"] * 100, 1)
        return StationOut(
            id=raw["id"],
            name=raw["name"],
            river=raw["river"],
            level_m=raw["level_m"],
            flood_stage_m=raw["flood_stage_m"],
            trend=Trend(raw["trend"]),
            lat=raw["lat"],
            lng=raw["lng"],
            flood_pct=pct,
        )

    def kpis(self) -> KpiSnapshot:
        p = self.primary_station()
        unread = sum(1 for a in self.alerts if not a["read"])
        return KpiSnapshot(
            current_level_m=p["level_m"],
            rain_24h_mm=self.rain_24h_mm,
            peak_predicted_m=self.peak_predicted_m,
            peak_eta_hours=self.peak_eta_hours,
            active_alerts=unread,
            model_rmse=self.model_rmse,
            model_nse=self.model_nse,
        )

    def dashboard(self) -> DashboardOut:
        return DashboardOut(
            basin_name=BASIN_NAME,
            primary_station_id=PRIMARY_STATION_ID,
            updated_at=self.updated_at,
            kpis=self.kpis(),
            stations=[self.station_out(s) for s in self.stations],
            level_series=[LevelPointOut(**p) for p in self.level_series],
            rain_forecast=[RainHourOut(**p) for p in self.rain_forecast],
            alerts=[AlertOut(**a) for a in self.alerts],
            model_metrics=ModelMetricsOut(rmse=self.model_rmse, nse=self.model_nse),
        )

    def tick_live(self) -> None:
        with self._lock:
            drift = (random.random() - 0.48) * 0.08
            for s in self.stations:
                if s["id"] == PRIMARY_STATION_ID:
                    s["level_m"] = round(s["level_m"] + drift, 2)
                    s["trend"] = "up" if drift > 0.02 else "down" if drift < -0.02 else "stable"
            self.peak_predicted_m = round(self.peak_predicted_m + drift * 0.5, 2)
            self.updated_at = _utcnow()

    def apply_ingestion(self, *, rain_24h: float | None = None, levels: dict[str, float] | None = None) -> None:
        with self._lock:
            if rain_24h is not None:
                self.rain_24h_mm = round(rain_24h, 1)
            if levels:
                for s in self.stations:
                    if s["id"] in levels:
                        s["level_m"] = round(levels[s["id"]], 2)
            self.updated_at = _utcnow()
            self._check_thresholds()

    def _check_thresholds(self) -> None:
        from app.core.config import settings

        p = self.primary_station()
        pct = p["level_m"] / p["flood_stage_m"] * 100
        if pct >= settings.threshold_danger_pct:
            level, title = AlertLevel.danger, "Perigo — cota crítica"
        elif pct >= settings.threshold_attention_pct:
            level, title = AlertLevel.attention, "Atenção — nível elevado"
        else:
            return
        msg = f"{p['name']}: {p['level_m']:.2f} m ({pct:.0f}% da cota)."
        if any(a["title"] == title and not a["read"] for a in self.alerts[-3:]):
            return
        self.alerts.insert(
            0,
            {
                "id": str(uuid.uuid4()),
                "level": level,
                "title": title,
                "message": msg,
                "station_id": p["id"],
                "timestamp": _utcnow(),
                "read": False,
            },
        )
        self.alerts = self.alerts[:50]

    def add_info_alert(self, title: str, message: str) -> AlertOut:
        with self._lock:
            alert = {
                "id": str(uuid.uuid4()),
                "level": AlertLevel.info,
                "title": title,
                "message": message,
                "station_id": PRIMARY_STATION_ID,
                "timestamp": _utcnow(),
                "read": False,
            }
            self.alerts.insert(0, alert)
            return AlertOut(**alert)


state = AppState()

from __future__ import annotations

import asyncio
import logging

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "hidroalerta",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Sao_Paulo",
    enable_utc=True,
    beat_schedule={
        "ingest-hourly": {
            "task": "hidroalerta.ingest_all",
            "schedule": crontab(minute=5),
        },
    },
)


def _run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(name="hidroalerta.ingest_all")
def ingest_all() -> dict:
    from app.ingestion.clients import fetch_hidroweb_levels, fetch_openmeteo_rain_mm
    from app.services.state import PRIMARY_STATION_ID, state

    async def _ingest():
        primary = state.primary_station()
        rain_24h, forecast = await fetch_openmeteo_rain_mm(primary["lat"], primary["lng"])
        levels = await fetch_hidroweb_levels()
        state.apply_ingestion(rain_24h=rain_24h, levels=levels)
        if forecast:
            state.rain_forecast = forecast
        alert = state.add_info_alert(
            "Ingestão concluída",
            f"OpenMeteo + HidroWeb — chuva 24h: {rain_24h} mm.",
        )
        return {
            "rain_24h_mm": rain_24h,
            "stations": len(levels),
            "alert_id": alert.id,
            "primary": PRIMARY_STATION_ID,
        }

    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(_ingest())
        logger.info("Ingestão OK: %s", result)
        return result
    except Exception as e:
        logger.exception("Ingestão parcial falhou: %s", e)
        levels = loop.run_until_complete(fetch_hidroweb_levels())
        state.apply_ingestion(levels=levels)
        raise
    finally:
        loop.close()

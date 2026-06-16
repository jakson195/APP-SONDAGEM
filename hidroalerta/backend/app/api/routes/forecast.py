from fastapi import APIRouter, Query

from app.schemas import LevelPointOut, RainHourOut
from app.services.state import state

router = APIRouter()


@router.get("/level-series", response_model=list[LevelPointOut])
def level_series(hours: int = Query(48, ge=1, le=168)):
    return [LevelPointOut(**p) for p in state.level_series[-hours:]]


@router.get("/rain", response_model=list[RainHourOut])
def rain_forecast(hours: int = Query(36, ge=1, le=72)):
    return [RainHourOut(**p) for p in state.rain_forecast[:hours]]


@router.get("/kpis")
def forecast_kpis():
    return state.kpis()

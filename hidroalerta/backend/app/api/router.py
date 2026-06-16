from fastapi import APIRouter

from app.api.routes import alerts, dashboard, forecast, stations, ws

api_router = APIRouter()
api_router.include_router(dashboard.router, tags=["dashboard"])
api_router.include_router(stations.router, prefix="/stations", tags=["stations"])
api_router.include_router(forecast.router, prefix="/forecast", tags=["forecast"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(ws.router, tags=["websocket"])

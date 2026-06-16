from fastapi import APIRouter, HTTPException

from app.schemas import AlertOut
from app.services.state import state

router = APIRouter()


@router.get("", response_model=list[AlertOut])
def list_alerts(unread_only: bool = False):
    alerts = state.alerts
    if unread_only:
        alerts = [a for a in alerts if not a["read"]]
    return [AlertOut(**a) for a in alerts]


@router.patch("/{alert_id}/read", response_model=AlertOut)
def mark_read(alert_id: str):
    for a in state.alerts:
        if a["id"] == alert_id:
            a["read"] = True
            return AlertOut(**a)
    raise HTTPException(status_code=404, detail="Alerta não encontrado")

from fastapi import APIRouter, HTTPException

from app.services.state import state

router = APIRouter()


@router.get("")
def list_stations():
    return [state.station_out(s) for s in state.stations]


@router.get("/{station_id}")
def get_station(station_id: str):
    for s in state.stations:
        if s["id"] == station_id:
            return state.station_out(s)
    raise HTTPException(status_code=404, detail="Estação não encontrada")

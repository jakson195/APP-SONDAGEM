from fastapi import APIRouter

from app.services.state import state

router = APIRouter()


@router.get("/dashboard")
def get_dashboard():
    return state.dashboard()


@router.post("/dashboard/tick")
def tick_dashboard():
    """Simula actualização live (dev)."""
    state.tick_live()
    return state.dashboard()

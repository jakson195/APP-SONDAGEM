from fastapi import APIRouter

router = APIRouter(tags=["health"])


def _engine_status() -> dict[str, bool]:
    from services.inversion.resipy_invert import is_resipy_available

    return {"resipy": is_resipy_available()}


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "geophysics-engine",
        "engines": _engine_status(),
    }

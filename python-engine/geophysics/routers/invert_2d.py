import asyncio

from fastapi import APIRouter, HTTPException

from schemas.invert_2d import Invert2DRequest, Invert2DResponse
from services.inversion.invert_2d import run_invert_2d

router = APIRouter(tags=["invert-2d"])


@router.post("/invert/2d", response_model=Invert2DResponse)
async def invert_2d(body: Invert2DRequest) -> Invert2DResponse:
    try:
        # Não bloquear o event loop — /health continua a responder durante FEM longo.
        return await asyncio.to_thread(run_invert_2d, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

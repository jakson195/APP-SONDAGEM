"""
DataGeo Geophysics Engine — FastAPI :8092

Motor ERT 2D nativo (FDM + adjoint + Gauss-Newton):
  GET  /health
  POST /invert          → {data:[{a,b,m,n,pa}], method, ...}

API DataGeo (frontend):
  GET  /api/v1/geophysics/health
  POST /api/v1/geophysics/invert/2d

Auxiliares:
  POST /mesh, /forward, /pseudosection
"""

from __future__ import annotations

import asyncio
import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from engine import InversionRequest, InversionResponse, run_inversion
from forward import run_forward
from invert import build_pseudosection, engine_status, run_invert
from mesh import build_mesh_response
from api_schemas import (
    ForwardRequest,
    ForwardResponse,
    Invert2DRequest,
    Invert2DResponse,
    MeshRequest,
    MeshResponse,
    PseudoSectionRequest,
    PseudoSectionResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("geophysics.server")

_origins = os.environ.get("ALLOWED_ORIGINS", "*")
_cors = ["*"] if _origins.strip() == "*" else [o.strip() for o in _origins.split(",") if o.strip()]

app = FastAPI(
    title="DataGeo Geophysics Engine",
    description=(
        "Inversão ERT 2D — FDM Poisson, Jacobiana adjoint, "
        "Gauss-Newton com L2/L1/Occam"
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/api/v1/geophysics/health")
async def health() -> dict:
    engines = engine_status()
    return {
        "status": "ok",
        "service": "geophysics-engine",
        "motor": engines.get("motor", "FDM+Jacobiana+GaussNewton"),
        "engines": engines,
    }


async def _invert_native(body: InversionRequest) -> InversionResponse:
    try:
        return await asyncio.to_thread(run_inversion, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("invert failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/invert", response_model=None)
@app.post("/invert/ert", response_model=None)
async def invert(request: Request) -> dict:
    """
    Inversão ERT 2D — aceita formato nativo {data} e formato frontend {readings}.
    """
    try:
        raw = await request.json()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"JSON inválido: {e}")

    if "readings" in raw:
        # Formato frontend DataGeo → run_invert
        try:
            body = Invert2DRequest.model_validate(raw)
            result = await asyncio.to_thread(run_invert, body)
            return result.model_dump()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.exception("invert (readings) failed")
            raise HTTPException(status_code=500, detail=str(e)) from e
    else:
        # Formato nativo {data:[{a,b,m,n,pa}]}
        try:
            body = InversionRequest.model_validate(raw)
            result = await _invert_native(body)
            return result.model_dump()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.exception("invert (native) failed")
            raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/v1/geophysics/invert/2d", response_model=Invert2DResponse)
async def invert_datageo(body: Invert2DRequest) -> Invert2DResponse:
    """API completa DataGeo (leituras station_m/n/rho_ohm_m — frontend)."""
    try:
        return await asyncio.to_thread(run_invert, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("invert/2d failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/mesh", response_model=MeshResponse)
async def mesh(body: MeshRequest) -> MeshResponse:
    try:
        return await asyncio.to_thread(build_mesh_response, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/forward", response_model=ForwardResponse)
async def forward(body: ForwardRequest) -> ForwardResponse:
    try:
        return await asyncio.to_thread(run_forward, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/pseudosection", response_model=PseudoSectionResponse)
async def pseudosection(body: PseudoSectionRequest) -> PseudoSectionResponse:
    try:
        return await asyncio.to_thread(build_pseudosection, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "geophysics-engine",
        "docs": "/docs",
        "health": "/health",
        "invert": "POST /invert",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8092"))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("GEOPHYS_RELOAD", "").lower() in ("1", "true", "yes"),
    )


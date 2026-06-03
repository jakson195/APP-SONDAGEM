"""DataGeo Digital — Geophysics 3D Engine (FastAPI).

Interpolação voxel, QC, inversão 2D ERT (FDM/FEM).

Uso:
  cd python-engine/geophysics
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8092
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, invert_2d, qc, volume

_origins = os.environ.get("ALLOWED_ORIGINS", "*")
_cors_origins = ["*"] if _origins.strip() == "*" else [o.strip() for o in _origins.split(",") if o.strip()]

app = FastAPI(
    title="DataGeo Geophysics Engine",
    description="Volume 3D, QC e inversão 2D ERT (FDM/FEM + Occam χ²)",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1/geophysics")
app.include_router(volume.router, prefix="/api/v1/geophysics")
app.include_router(qc.router, prefix="/api/v1/geophysics")
app.include_router(invert_2d.router, prefix="/api/v1/geophysics")


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "geophysics-engine", "docs": "/docs"}

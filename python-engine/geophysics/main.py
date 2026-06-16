"""DataGeo Digital — Geophysics 3D Engine (FastAPI).

Interpolação voxel entre secções ERT: IDW, Kriging (GSTools), RBF (SciPy).

Uso:
  cd python-engine/geophysics
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8092
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, invert_2d, qc, volume

app = FastAPI(
    title="DataGeo Geophysics Engine",
    description="Volume 3D pseudo-georreferenciado a partir de secções geofísicas",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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

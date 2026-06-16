"""DataGeo Digital — Landsat Historical Engine (FastAPI).

Download automático Landsat/Sentinel-2 via STAC (Planetary Computer + Earth Search).
Saída GeoTIFF (rasterio/GDAL) + preview PNG para mapa.

Uso:
  cd python-engine/landsat
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8093
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import catalog, download, elevation, health, search
from services.stac_client import data_dir

app = FastAPI(
    title="DataGeo Landsat Engine",
    description=(
        "Imagens históricas gratuitas Landsat/Sentinel-2 desde 1972 — "
        "USGS/STAC, Planetary Computer, integração Sentinel Hub/GEE/INPE"
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(health.router, prefix="/api/v1/landsat")
app.include_router(catalog.router, prefix="/api/v1/landsat")
app.include_router(download.router, prefix="/api/v1/landsat")
app.include_router(elevation.router, prefix="/api/v1/landsat")

_data = data_dir()
app.mount("/data", StaticFiles(directory=_data, check_dir=False), name="landsat-data")


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "landsat-engine",
        "docs": "/docs",
        "search": "POST /landsat/search",
        "port": "8093",
    }

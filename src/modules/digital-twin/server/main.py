from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.routers import (
    alerts,
    deformations,
    health,
    insar,
    predictions,
    projects,
    timeline,
    twin,
    uploads,
)
from app.services.storage import ensure_upload_dirs


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_upload_dirs()
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
    yield


app = FastAPI(
    title="Digital Twin API",
    description="API geotécnica — LiDAR, InSAR (Sentinel-1), deformações, timeline e alertas (PostGIS)",
    version="0.5.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=settings.api_v1_prefix)
app.include_router(projects.router, prefix=settings.api_v1_prefix)
app.include_router(uploads.router, prefix=settings.api_v1_prefix)
app.include_router(insar.router, prefix=settings.api_v1_prefix)
app.include_router(deformations.router, prefix=settings.api_v1_prefix)
app.include_router(timeline.router, prefix=settings.api_v1_prefix)
app.include_router(alerts.router, prefix=settings.api_v1_prefix)
app.include_router(predictions.router, prefix=settings.api_v1_prefix)
app.include_router(twin.router, prefix=settings.api_v1_prefix)

_tilesets_root = settings.upload_path / "tilesets"
_tilesets_root.mkdir(parents=True, exist_ok=True)
app.mount(
    f"{settings.api_v1_prefix}/tilesets",
    StaticFiles(directory=_tilesets_root, check_dir=False),
    name="tilesets",
)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "digital-twin-api", "docs": "/docs"}

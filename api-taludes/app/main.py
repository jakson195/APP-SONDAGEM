from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import analysis, health, surveys

app = FastAPI(
    title="DataGeo Taludes API",
    description="Monitoramento temporal de taludes — ortofotos drone, optical flow, DSM, IA",
    version="1.0.0",
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(surveys.router)
app.include_router(analysis.router)


@app.get("/outputs/{job_id}/{filename:path}")
def serve_output(job_id: str, filename: str):
    path = settings.output_dir / job_id / filename
    if not path.exists() or not path.is_file():
        from fastapi import HTTPException

        raise HTTPException(404)
    media = "application/octet-stream"
    if filename.endswith(".png"):
        media = "image/png"
    elif filename.endswith(".geojson"):
        media = "application/geo+json"
    elif filename.endswith(".tif"):
        media = "image/tiff"
    return FileResponse(path, media_type=media)


settings.output_dir.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(settings.output_dir)), name="files")

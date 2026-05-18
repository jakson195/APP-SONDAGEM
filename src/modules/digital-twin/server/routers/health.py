from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.pdal_las import pdal_available
from app.services.tiles3d_convert import py3dtiles_available

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    row = await db.execute(text("SELECT PostGIS_Version()"))
    version = row.scalar_one()
    return {"status": "ok", "postgis": version}


@router.get("/health/las-pipeline")
async def health_las_pipeline() -> dict[str, bool | str]:
    return {
        "status": "ok" if pdal_available() and py3dtiles_available() else "degraded",
        "pdal": pdal_available(),
        "py3dtiles": py3dtiles_available(),
    }


@router.get("/health/insar-pipeline")
async def health_insar_pipeline() -> dict[str, bool | str]:
    try:
        import rasterio  # noqa: F401

        rasterio_ok = True
    except ImportError:
        rasterio_ok = False
    return {
        "status": "ok" if rasterio_ok else "degraded",
        "rasterio": rasterio_ok,
    }

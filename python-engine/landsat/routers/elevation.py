from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from services.opentopography import VALID_DEM_TYPES, download_dem_geotiff
from services.stac_client import data_dir

router = APIRouter(prefix="/elevation", tags=["elevation"])


class DemRequest(BaseModel):
    west: float
    south: float
    east: float
    north: float
    dem_type: str = Field(default="COP30", description="COP30, SRTMGL1, NASADEM, …")


@router.get("/dem-types")
async def list_dem_types() -> dict:
    return {
        "source": "OpenTopography",
        "url": "https://opentopography.org/",
        "types": list(VALID_DEM_TYPES),
        "default": "COP30",
        "configured": bool(os.environ.get("OPENTOPOGRAPHY_API_KEY", "").strip()),
    }


@router.post("/dem")
async def fetch_dem(body: DemRequest) -> Response:
    """Download GeoTIFF elevação (OpenTopography) — recomendado DataGeo."""
    bbox = {
        "west": body.west,
        "south": body.south,
        "east": body.east,
        "north": body.north,
    }
    try:
        data, meta = download_dem_geotiff(bbox, body.dem_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    out_dir = os.path.join(data_dir(), "dem")
    os.makedirs(out_dir, exist_ok=True)
    fname = f"dem_{body.dem_type}_{body.west:.4f}_{body.south:.4f}.tif"
    path = os.path.join(out_dir, fname)
    with open(path, "wb") as f:
        f.write(data)

    return Response(
        content=data,
        media_type="image/tiff",
        headers={
            "X-Datageo-Source": "opentopography",
            "X-Dem-Type": meta["dem_type"],
            "Content-Disposition": f'attachment; filename="{fname}"',
        },
    )

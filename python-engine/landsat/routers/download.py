from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from schemas.imagery import DownloadRequest, DownloadResponse
from services.geotiff_pipeline import (
    auto_spectral_mode,
    download_scene_geotiff,
    render_geotiff_to_png,
)
from services.stac_client import band_hrefs, data_dir, load_item_from_url, resolve_scene_by_date
from services.providers import provider_status

router = APIRouter(prefix="/imagery", tags=["imagery"])


def _resolve_item(body: DownloadRequest):
    if body.stac_item_url:
        return load_item_from_url(body.stac_item_url)
    if body.date:
        rec = resolve_scene_by_date(
            body.bbox.model_dump(),
            body.date,
            max_cloud_pct=body.max_cloud_pct,
        )
        if not rec:
            raise HTTPException(404, f"Sem cena Landsat/S2 próxima de {body.date}")
        return load_item_from_url(rec["stac_item_url"])
    raise HTTPException(400, "Informe stac_item_url ou date")


@router.post("/download", response_model=DownloadResponse)
async def download_imagery(body: DownloadRequest) -> DownloadResponse:
    """Baixa bandas STAC, recorta à área e grava GeoTIFF."""
    item = _resolve_item(body)
    scene_id = body.scene_id or item.id
    date = body.date or (item.properties.get("datetime", "")[:10])
    satellite = item.properties.get("platform") or item.collection_id or "Landsat"

    bands = band_hrefs(item)
    if not bands.get("red"):
        raise HTTPException(422, "Item STAC sem bandas red/green/blue")

    geotiff_path, meta = download_scene_geotiff(
        item, body.bbox.model_dump(), scene_id, bands
    )
    mode = auto_spectral_mode(date, body.spectral_mode)
    safe = scene_id.replace("/", "_").replace(":", "_")
    preview_rel = f"/api/v1/landsat/imagery/preview/{safe}.png?spectral_mode={mode}"

    return DownloadResponse(
        ok=True,
        scene_id=scene_id,
        date=date,
        satellite=str(satellite),
        geotiff_path=geotiff_path,
        preview_url=preview_rel,
        bounds=body.bbox,
        spectral_mode=mode,
        crs=meta["crs"],
        width=meta["width"],
        height=meta["height"],
        sources=list(provider_status().keys()),
    )


@router.get("/preview/{scene_key}.png")
async def preview_png(scene_key: str, spectral_mode: str = "rgb") -> Response:
    geotiff_path = os.path.join(data_dir(), "geotiff", f"{scene_key}.tif")
    if not os.path.isfile(geotiff_path):
        raise HTTPException(404, "GeoTIFF não encontrado — execute /download primeiro")
    mode = spectral_mode if spectral_mode in ("rgb", "grayscale", "false_color", "ndvi") else "rgb"
    png = render_geotiff_to_png(geotiff_path, mode)  # type: ignore[arg-type]
    return Response(content=png, media_type="image/png")


@router.get("/geotiff/{scene_key}.tif")
async def get_geotiff(scene_key: str) -> FileResponse:
    path = os.path.join(data_dir(), "geotiff", f"{scene_key}.tif")
    if not os.path.isfile(path):
        raise HTTPException(404, "GeoTIFF não encontrado")
    return FileResponse(path, media_type="image/tiff", filename=f"{scene_key}.tif")

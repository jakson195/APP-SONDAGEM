"""POST /landsat/search — busca STAC Landsat/Sentinel (Planetary Computer + Earth Search)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from schemas.imagery import (
    CatalogSearchRequest,
    CatalogSearchResponse,
    SceneRecord,
    YearSearchRequest,
)
from services.stac_client import search_scenes, search_scenes_for_year

router = APIRouter(prefix="/landsat", tags=["landsat"])


def _to_response(
    scenes_raw: list[dict],
    sources: list[str],
    warnings: list[str],
    *,
    satellites: list[str] | None = None,
) -> CatalogSearchResponse:
    scenes: list[SceneRecord] = []
    for s in scenes_raw:
        if satellites and s["provider"] not in satellites:
            continue
        scenes.append(
            SceneRecord(
                id=s["id"],
                collection=s["collection"],
                provider=s["provider"],
                satellite=s["satellite"],
                date=s["date"],
                cloud_cover_pct=s.get("cloud_cover_pct"),
                stac_item_url=s["stac_item_url"],
                platform=s.get("platform"),
                visual_mode=s.get("visual_mode", "natural"),
            )
        )
    if not scenes and not any("Nenhuma cena" in w for w in warnings):
        warnings.append("Nenhuma cena STAC para a área/período informados.")
    return CatalogSearchResponse(scenes=scenes, sources=sources, warnings=warnings)


@router.post("/search", response_model=CatalogSearchResponse)
async def landsat_search(body: CatalogSearchRequest) -> CatalogSearchResponse:
    """
    Busca cenas Landsat/Sentinel-2 via STAC.

    - **bbox**: west, south, east, north (WGS84)
    - **date_from** / **date_to**: YYYY-MM-DD (ex. 1972-07-23 … 2026-12-31)
    - **max_cloud_pct**: filtro de cobertura de nuvem (padrão 40)
    - **limit**: máximo de cenas (padrão 80; amostra 1 por ano)
    """
    if body.date_from > body.date_to:
        raise HTTPException(status_code=400, detail="date_from deve ser <= date_to")

    west, south, east, north = body.bbox.west, body.bbox.south, body.bbox.east, body.bbox.north
    if west >= east or south >= north:
        raise HTTPException(status_code=400, detail="bbox inválido")

    scenes_raw, sources, warnings = search_scenes(
        bbox=body.bbox.model_dump(),
        date_from=body.date_from,
        date_to=body.date_to,
        max_cloud_pct=body.max_cloud_pct,
        limit=body.limit,
    )
    return _to_response(scenes_raw, sources, warnings, satellites=body.satellites)


@router.post("/search-year", response_model=CatalogSearchResponse)
async def landsat_search_year(body: YearSearchRequest) -> CatalogSearchResponse:
    """Atalho: bbox + year (sem date_from/date_to)."""
    scenes_raw, sources, warnings = search_scenes_for_year(
        bbox=body.bbox.model_dump(),
        year=body.year,
        max_cloud_pct=body.max_cloud_pct,
        limit=body.limit,
    )
    return _to_response(scenes_raw, sources, warnings)

from __future__ import annotations

from fastapi import APIRouter

from schemas.imagery import (
    BboxWgs84,
    CatalogSearchRequest,
    CatalogSearchResponse,
    GaruvaExample,
    SceneRecord,
    YearSearchRequest,
)
from services.providers import gee_note, inpe_note, provider_status, sentinel_hub_note
from services.stac_client import search_scenes, search_scenes_for_year

router = APIRouter(prefix="/catalog", tags=["catalog"])

GARUVA_BBOX = BboxWgs84(west=-48.72, south=-26.32, east=-48.58, north=-26.22)


@router.get("/example/garuva", response_model=GaruvaExample)
async def garuva_example() -> GaruvaExample:
    """Exemplo: Garuva SC, 1972–2026 (Landsat + Sentinel-2)."""
    return GaruvaExample(bbox=GARUVA_BBOX)


@router.get("/providers")
async def list_providers() -> dict:
    notes = [n for n in [sentinel_hub_note(), gee_note(), inpe_note()] if n]
    return {"providers": provider_status(), "notes": notes}


@router.post("/search", response_model=CatalogSearchResponse)
async def search_catalog(body: CatalogSearchRequest) -> CatalogSearchResponse:
    scenes_raw, sources, warnings = search_scenes(
        bbox=body.bbox.model_dump(),
        date_from=body.date_from,
        date_to=body.date_to,
        max_cloud_pct=body.max_cloud_pct,
        limit=body.limit,
    )
    for note in [sentinel_hub_note(), gee_note(), inpe_note()]:
        if note:
            warnings.append(note)

    scenes: list[SceneRecord] = []
    for s in scenes_raw:
        if body.satellites and s["provider"] not in body.satellites:
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

    if not scenes:
        warnings.append("Nenhuma cena STAC para a área/período informados.")

    return CatalogSearchResponse(scenes=scenes, sources=sources, warnings=warnings)


@router.post("/search-year", response_model=CatalogSearchResponse)
async def search_catalog_year(body: YearSearchRequest) -> CatalogSearchResponse:
    """Busca STAC para um ano — todas as cenas na área (Planetary Computer + Earth Search)."""
    scenes_raw, sources, warnings = search_scenes_for_year(
        bbox=body.bbox.model_dump(),
        year=body.year,
        max_cloud_pct=body.max_cloud_pct,
        limit=body.limit,
    )
    scenes = [
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
        for s in scenes_raw
    ]
    if not scenes:
        warnings.append(f"Nenhuma cena STAC em {body.year} para esta área.")
    return CatalogSearchResponse(scenes=scenes, sources=sources, warnings=warnings)

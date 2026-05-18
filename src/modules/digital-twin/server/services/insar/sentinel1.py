"""Leitura e descoberta de imagens Sentinel-1 (Copernicus Data Space / metadados)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class Sentinel1Scene:
    scene_id: str
    product_name: str
    acquisition_date: date
    orbit_direction: str
    footprint_wkt: str | None
    download_url: str | None = None
    bytes_size: int | None = None
    properties: dict[str, Any] = field(default_factory=dict)


def _build_odata_filter(
    aoi_wkt: str,
    date_from: date,
    date_to: date,
    orbit_direction: str | None,
) -> str:
    start = f"{date_from.isoformat()}T00:00:00.000Z"
    end = f"{date_to.isoformat()}T23:59:59.999Z"
    parts = [
        "Collection/Name eq 'SENTINEL-1'",
        "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType'"
        " and att/OData.CSC.StringAttribute/Value eq 'SLC')",
        f"ContentDate/Start gt {start}",
        f"ContentDate/Start lt {end}",
        f"OData.CSC.Intersects(area=geography'SRID=4326;{aoi_wkt}')",
    ]
    if orbit_direction:
        o = orbit_direction.upper()
        parts.append(
            "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'orbitDirection'"
            f" and att/OData.CSC.StringAttribute/Value eq '{o}')"
        )
    return " and ".join(parts)


def _footprint_to_wkt(geo: dict[str, Any] | None) -> str | None:
    if not geo or geo.get("type") != "Polygon":
        return None
    coords = geo["coordinates"][0]
    pairs = ", ".join(f"{c[0]} {c[1]}" for c in coords)
    return f"POLYGON(({pairs}))"


async def search_sentinel1_scenes(
    aoi_wkt: str,
    date_from: date,
    date_to: date,
    orbit_direction: str | None = None,
    *,
    max_scenes: int | None = None,
) -> list[Sentinel1Scene]:
    """
    Pesquisa produtos Sentinel-1 SLC no catálogo Copernicus Data Space (OData).
    Sem credenciais devolve lista vazia e o pipeline pode usar cenas sintéticas.
    """
    limit = max_scenes or settings.insar_max_scenes
    base = settings.copernicus_odata_url.rstrip("/")
    filt = _build_odata_filter(aoi_wkt, date_from, date_to, orbit_direction)
    params: dict[str, Any] = {
        "$filter": filt,
        "$top": limit,
        "$orderby": "ContentDate/Start asc",
        "$expand": "Attributes",
    }

    headers: dict[str, str] = {}
    if settings.copernicus_username and settings.copernicus_password:
        import base64

        token = base64.b64encode(
            f"{settings.copernicus_username}:{settings.copernicus_password}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {token}"

    scenes: list[Sentinel1Scene] = []
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(f"{base}/Products", params=params, headers=headers)
            if resp.status_code == 401:
                logger.warning("Copernicus: credenciais inválidas ou ausentes")
                return []
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("Copernicus OData indisponível: %s", exc)
        return []

    for item in data.get("value", []):
        name = item.get("Name", "")
        scene_id = item.get("Id", name)
        start = item.get("ContentDate", {}).get("Start", "")
        try:
            acq = datetime.fromisoformat(start.replace("Z", "+00:00")).date()
        except ValueError:
            acq = date_from
        orbit = "ASC"
        for att in item.get("Attributes", []):
            if att.get("Name") == "orbitDirection":
                orbit = att.get("Value", orbit)
        geo = item.get("GeoFootprint")
        scenes.append(
            Sentinel1Scene(
                scene_id=str(scene_id),
                product_name=name,
                acquisition_date=acq,
                orbit_direction=str(orbit).upper(),
                footprint_wkt=_footprint_to_wkt(geo),
                download_url=item.get("@odata.mediaReadLink"),
                bytes_size=item.get("ContentLength"),
                properties={"source": "copernicus_dataspace"},
            )
        )
    return scenes


def synthetic_sentinel1_scenes(
    aoi_wkt: str,
    date_from: date,
    date_to: date,
    orbit_direction: str | None,
    *,
    count: int = 6,
) -> list[Sentinel1Scene]:
    """Gera metadados de cenas S1 para desenvolvimento quando o catálogo não está acessível."""
    from datetime import timedelta

    days = (date_to - date_from).days
    step = max(1, days // max(count, 1))
    orbit = (orbit_direction or "DESC").upper()
    scenes: list[Sentinel1Scene] = []
    current = date_from
    i = 0
    while current <= date_to and i < count:
        scenes.append(
            Sentinel1Scene(
                scene_id=f"S1_{orbit}_{current.isoformat()}_{i:02d}",
                product_name=f"S1A_IW_SLC__1SDV_{current.strftime('%Y%m%d')}",
                acquisition_date=current,
                orbit_direction=orbit,
                footprint_wkt=aoi_wkt,
                properties={"source": "synthetic", "mode": "IW"},
            )
        )
        current += timedelta(days=step)
        i += 1
    return scenes

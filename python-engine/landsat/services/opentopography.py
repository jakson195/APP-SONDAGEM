"""OpenTopography global DEM — GeoTIFF por bbox."""

from __future__ import annotations

import os
from typing import Any

import httpx

GLOBAL_DEM_URL = "https://portal.opentopography.org/API/globaldem"

VALID_DEM_TYPES = (
    "SRTMGL3",
    "SRTMGL1",
    "COP30",
    "COP90",
    "NASADEM",
    "AW3D30",
)


def download_dem_geotiff(
    bbox: dict[str, float],
    dem_type: str = "COP30",
    api_key: str | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """Baixa GeoTIFF de elevação (OpenTopography globaldem)."""
    if dem_type not in VALID_DEM_TYPES:
        raise ValueError(f"dem_type deve ser um de {VALID_DEM_TYPES}")

    key = api_key or os.environ.get("OPENTOPOGRAPHY_API_KEY", "").strip()
    if not key:
        raise ValueError(
            "OPENTOPOGRAPHY_API_KEY não configurada — obtenha em https://opentopography.org/"
        )

    params = {
        "demtype": dem_type,
        "south": bbox["south"],
        "north": bbox["north"],
        "west": bbox["west"],
        "east": bbox["east"],
        "outputFormat": "GTiff",
        "API_Key": key,
    }

    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        res = client.get(GLOBAL_DEM_URL, params=params)
        if res.status_code != 200:
            raise RuntimeError(
                f"OpenTopography {res.status_code}: {res.text[:300]}"
            )
        content_type = res.headers.get("content-type", "")
        if "html" in content_type.lower():
            raise RuntimeError("OpenTopography devolveu HTML — verifique API key e bbox.")
        return res.content, {
            "dem_type": dem_type,
            "size_bytes": len(res.content),
            "source": "opentopography",
        }

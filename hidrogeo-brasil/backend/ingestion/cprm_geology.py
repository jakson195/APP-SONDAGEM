"""Ingestão litologia CPRM/SGB (GeoSGB WFS) → PostGIS."""

from __future__ import annotations

import json
import logging
import math
import os
from pathlib import Path

import geopandas as gpd
import httpx
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed" / "lithology-brasil.geojson"
CACHE_DIR = ROOT / "data" / "cache"

WFS_BASE = os.environ.get(
    "CPRM_WFS_URL",
    "https://geoservicos.sgb.gov.br/geoserver/geosgb/wfs",
).rstrip("/")

# Escalas disponíveis no GeoSGB (1M = visão nacional; 250k/100k = mais detalhe)
CPRM_LITHO_LAYERS: dict[str, str] = {
    "1m": "geosgb:litoestratigrafia_1m",
    "250k": "geosgb:litoestratigrafia_250k",
    "100k": "geosgb:litoestratigrafia_100k",
    "50k": "geosgb:litoestratigrafia_50k",
}

DEFAULT_LAYER = CPRM_LITHO_LAYERS["1m"]
PAGE_SIZE = int(os.environ.get("CPRM_WFS_PAGE_SIZE", "5000"))


def _load_seed() -> gpd.GeoDataFrame:
    with SEED.open(encoding="utf-8") as f:
        data = json.load(f)
    return gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")


def _fix_text(val: object) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    if not s or s.lower() in ("none", "nan"):
        return ""
    return s


def _json_safe(val: object) -> object:
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, dict):
        return {k: _json_safe(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_json_safe(v) for v in val]
    return val


def _row_from_props(props: dict, geom) -> dict | None:
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        geom = MultiPolygon([geom])
    elif geom.geom_type != "MultiPolygon":
        return None

    sigla = _fix_text(props.get("sigla"))
    nome = _fix_text(props.get("nome") or props.get("unit_name") or "Unidade")
    unit_name = f"{sigla} — {nome}".strip(" —") if sigla else nome

    litotipos = _fix_text(props.get("litotipos"))
    legenda = _fix_text(props.get("legenda"))
    ambiente = _fix_text(props.get("ambiente_tectonico"))

    age_parts = [
        _fix_text(props.get("range")),
        _fix_text(props.get("era_min")),
        _fix_text(props.get("sistema_min")),
        _fix_text(props.get("epoca_min")),
    ]
    age = " · ".join(p for p in age_parts if p)

    desc_parts = [p for p in (legenda, ambiente) if p]
    description = " ".join(desc_parts)

    clean_props = {k: _fix_text(v) if isinstance(v, str) else v for k, v in props.items()}
    clean_props = _json_safe(clean_props)

    return {
        "unit_name": unit_name,
        "rock_type": litotipos,
        "age": age,
        "description": description,
        "attrs": json.dumps(clean_props, ensure_ascii=False, allow_nan=False),
        "wkt": geom.wkt,
    }


def _fetch_wfs_page(
    client: httpx.Client,
    type_name: str,
    *,
    start_index: int,
    max_features: int,
) -> dict:
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typeName": type_name,
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
        "maxFeatures": str(max_features),
        "startIndex": str(start_index),
    }
    r = client.get(WFS_BASE, params=params)
    r.raise_for_status()
    return r.json()


def _download_wfs(type_name: str) -> gpd.GeoDataFrame | None:
    cache_file = CACHE_DIR / f"{type_name.replace(':', '_')}.geojson"
    if cache_file.exists() and cache_file.stat().st_size > 100_000:
        logger.info("Cache CPRM: %s", cache_file)
        return gpd.read_file(cache_file)

    verify = os.environ.get("CPRM_TLS_VERIFY", "false").lower() in ("1", "true", "yes")
    features: list[dict] = []

    try:
        with httpx.Client(timeout=900.0, verify=verify, follow_redirects=True) as client:
            # Pedido único (GeoSGB devolve ~46k feições de uma vez para escala 1M)
            logger.info("CPRM WFS download completo: %s", type_name)
            r = client.get(
                WFS_BASE,
                params={
                    "service": "WFS",
                    "version": "1.1.0",
                    "request": "GetFeature",
                    "typeName": type_name,
                    "outputFormat": "application/json",
                    "srsName": "EPSG:4326",
                },
            )
            r.raise_for_status()
            data = r.json()
            features = data.get("features") or []
    except Exception as e:
        logger.warning("Download completo falhou (%s): %s — tentando paginação", type_name, e)
        try:
            with httpx.Client(timeout=600.0, verify=verify, follow_redirects=True) as client:
                start = 0
                while True:
                    logger.info("CPRM WFS %s — startIndex=%d", type_name, start)
                    data = _fetch_wfs_page(client, type_name, start_index=start, max_features=PAGE_SIZE)
                    batch = data.get("features") or []
                    if not batch:
                        break
                    features.extend(batch)
                    if len(batch) < PAGE_SIZE:
                        break
                    start += PAGE_SIZE
        except Exception as e2:
            logger.warning("CPRM WFS indisponível (%s): %s", type_name, e2)
            return None

    if not features:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    collection = {"type": "FeatureCollection", "features": features}
    cache_file.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
    logger.info("CPRM cache gravado: %s (%d feições)", cache_file, len(features))
    return gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")


def ingest_lithology(
    database_url: str,
    *,
    truncate: bool = True,
    scale: str = "1m",
) -> int:
    type_name = CPRM_LITHO_LAYERS.get(scale, DEFAULT_LAYER)
    gdf = _download_wfs(type_name)
    if gdf is None:
        logger.info("Usando seed CPRM: %s", SEED)
        gdf = _load_seed()

    gdf = gdf.to_crs(4326)
    rows: list[dict] = []
    for _, row in gdf.iterrows():
        props = row.drop(labels=["geometry"]).to_dict()
        mapped = _row_from_props(props, row.geometry)
        if mapped:
            rows.append(mapped)

    if not rows:
        logger.warning("Nenhuma litologia ingerida")
        return 0

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if truncate:
            conn.execute(text("TRUNCATE geo.lithology RESTART IDENTITY"))
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            chunk = rows[i : i + batch_size]
            conn.execute(
                text(
                    """
                    INSERT INTO geo.lithology
                      (unit_name, rock_type, age, description, attrs, geom)
                    SELECT unit_name, rock_type, age, description,
                           CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)
                    FROM json_to_recordset(CAST(:payload AS json))
                      AS x(unit_name text, rock_type text, age text, description text,
                           attrs text, wkt text)
                    """
                ),
                {"payload": json.dumps(chunk, ensure_ascii=False)},
            )
    logger.info("Ingeridas %d unidades litológicas CPRM (%s)", len(rows), type_name)
    return len(rows)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
    )
    scale = os.environ.get("CPRM_LITHO_SCALE", "1m")
    print(f"OK — {ingest_lithology(url, scale=scale)} polígonos")

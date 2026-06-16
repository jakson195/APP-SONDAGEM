"""Ingestão limites administrativos IBGE — estados (UF) e municípios."""

from __future__ import annotations

import json
import logging
import math
import os
import zipfile
from pathlib import Path

import geopandas as gpd
import httpx
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache"

SOURCES = {
    "states": "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/BR_UF_2022.zip",
    "municipalities": "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/BR_Municipios_2022.zip",
}

BATCH = 500


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


def _first(props: dict, *keys: str) -> object | None:
    for key in keys:
        val = props.get(key)
        if val is not None and str(val).strip() not in ("", "None", "nan"):
            return val
    return None


def _download(url: str, filename: str) -> Path:
    path = CACHE_DIR / filename
    if path.exists() and path.stat().st_size > 10_000:
        return path
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    verify = os.environ.get("IBGE_TLS_VERIFY", "false").lower() in ("1", "true")
    logger.info("A transferir %s", filename)
    with httpx.Client(timeout=900.0, verify=verify, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def _read_shp_from_zip(zip_path: Path) -> gpd.GeoDataFrame:
    with zipfile.ZipFile(zip_path) as zf:
        shp = next(n for n in zf.namelist() if n.endswith(".shp"))
    return gpd.read_file(f"zip://{zip_path}!/{shp}")


def _to_multipolygon(geom):
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        return MultiPolygon([geom])
    if geom.geom_type == "MultiPolygon":
        return geom
    return None


def _bulk_insert(
    conn,
    table: str,
    columns: str,
    record_def: str,
    select_sql: str,
    rows: list[dict],
) -> None:
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        conn.execute(
            text(
                f"""
                INSERT INTO {table} ({columns})
                {select_sql}
                FROM json_to_recordset(CAST(:payload AS json)) AS x{record_def}
                """
            ),
            {"payload": json.dumps(chunk, ensure_ascii=False, allow_nan=False)},
        )


def ingest_states(database_url: str, *, truncate: bool = True) -> int:
    zip_path = _download(SOURCES["states"], "ibge_uf_2022.zip")
    gdf = _read_shp_from_zip(zip_path).to_crs(4326)
    logger.info("Estados IBGE: %d polígonos", len(gdf))

    rows: list[dict] = []
    for _, row in gdf.iterrows():
        geom = _to_multipolygon(row.geometry)
        if geom is None:
            continue
        props = _json_safe(row.drop(labels=["geometry"]).to_dict())
        uf = str(_first(props, "SIGLA_UF", "sigla_uf", "UF", "uf") or "").upper()
        name = str(_first(props, "NM_UF", "nm_uf", "name", "NOME") or uf or "Estado")
        code = str(_first(props, "CD_UF", "cd_uf", "code") or uf)
        region = _first(props, "NM_REGIAO", "nm_regiao", "REGIAO", "region")
        rows.append(
            {
                "code": code,
                "uf": uf or code,
                "name": name,
                "region": str(region) if region else None,
                "attrs": json.dumps(props, ensure_ascii=False),
                "wkt": geom.wkt,
            }
        )

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if truncate:
            conn.execute(text("TRUNCATE admin.states RESTART IDENTITY"))
        _bulk_insert(
            conn,
            "admin.states",
            "code, uf, name, region, attrs, geom",
            "(code text, uf text, name text, region text, attrs text, wkt text)",
            "SELECT code, uf, name, region, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)",
            rows,
        )
    logger.info("Ingeridos %d estados", len(rows))
    return len(rows)


def ingest_municipalities(database_url: str, *, truncate: bool = True) -> int:
    zip_path = _download(SOURCES["municipalities"], "ibge_municipios_2022.zip")
    gdf = _read_shp_from_zip(zip_path).to_crs(4326)
    logger.info("Municípios IBGE: %d polígonos", len(gdf))

    rows: list[dict] = []
    for _, row in gdf.iterrows():
        geom = _to_multipolygon(row.geometry)
        if geom is None:
            continue
        props = _json_safe(row.drop(labels=["geometry"]).to_dict())
        name = str(_first(props, "NM_MUN", "nm_mun", "name", "NOME") or "Município")
        uf = str(_first(props, "SIGLA_UF", "sigla_uf", "UF", "uf") or "").upper()
        state_name = _first(props, "NM_UF", "nm_uf", "state_name")
        code = str(_first(props, "CD_MUN", "cd_mun", "code") or len(rows) + 1)
        rows.append(
            {
                "code": code,
                "name": name,
                "uf": uf,
                "state_name": str(state_name) if state_name else None,
                "attrs": json.dumps(props, ensure_ascii=False),
                "wkt": geom.wkt,
            }
        )

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if truncate:
            conn.execute(text("TRUNCATE admin.municipalities RESTART IDENTITY"))
        _bulk_insert(
            conn,
            "admin.municipalities",
            "code, name, uf, state_name, attrs, geom",
            "(code text, name text, uf text, state_name text, attrs text, wkt text)",
            "SELECT code, name, uf, state_name, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)",
            rows,
        )
    logger.info("Ingeridos %d municípios", len(rows))
    return len(rows)


def ingest_all(database_url: str) -> dict[str, int]:
    return {
        "states": ingest_states(database_url),
        "municipalities": ingest_municipalities(database_url),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
    )
    stats = ingest_all(url)
    print("OK —", stats)

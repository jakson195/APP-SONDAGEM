"""Ingestão ANM SIGMINE — processos minerários e camadas associadas."""

from __future__ import annotations

import json
import logging
import math
import os
import zipfile
from datetime import date, datetime
from pathlib import Path

import geopandas as gpd
import httpx
from shapely import wkb, wkt as shapely_wkt
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import create_engine, text

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache"
BASE = "https://dadosabertos.anm.gov.br/SIGMINE"

SOURCES = {
    "mining_processes": f"{BASE}/BRASIL.zip",
    "source_protection": f"{BASE}/PROTECAO_FONTE.zip",
    "mining_leases": f"{BASE}/ARRENDAMENTO.zip",
    "mining_blocks": f"{BASE}/BLOQUEIO.zip",
    "placer_reserves": f"{BASE}/RESERVAS_GARIMPEIRAS.zip",
}

TABLES = {
    "mining_processes": "mining.mining_processes",
    "source_protection": "mining.source_protection",
    "mining_leases": "mining.mining_leases",
    "mining_blocks": "mining.mining_blocks",
    "placer_reserves": "mining.placer_reserves",
}

BATCH = 500


def _json_safe(val: object) -> object:
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if pd is not None and isinstance(val, pd.Timestamp):
        return val.isoformat()
    if hasattr(val, "item") and callable(val.item):
        try:
            return _json_safe(val.item())
        except (ValueError, TypeError):
            pass
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
    return val


def _download(url: str, filename: str) -> Path:
    path = CACHE_DIR / filename
    if path.exists() and path.stat().st_size > 5_000:
        return path
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    verify = os.environ.get("ANM_TLS_VERIFY", "false").lower() in ("1", "true")
    logger.info("A transferir %s", filename)
    with httpx.Client(timeout=900.0, verify=verify, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def _read_shp_from_zip(zip_path: Path) -> gpd.GeoDataFrame:
    with zipfile.ZipFile(zip_path) as zf:
        shp = next(n for n in zf.namelist() if n.endswith(".shp"))
    gdf = gpd.read_file(f"zip://{zip_path}!/{shp}")
    gdf = gdf.to_crs(4326)
    gdf["geometry"] = gdf.geometry.apply(_force_2d)
    return gdf


def _force_2d(geom):
    if geom is None or geom.is_empty:
        return geom
    try:
        return wkb.loads(wkb.dumps(geom, output_dimension=2))
    except Exception:
        return shapely_wkt.loads(geom.wkt.replace(" Z", "").replace(" M", ""))


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


def _rows_from_gdf(gdf: gpd.GeoDataFrame, mapper) -> list[dict]:
    rows: list[dict] = []
    for _, row in gdf.iterrows():
        geom = _to_multipolygon(row.geometry)
        if geom is None:
            continue
        props = _json_safe(row.drop(labels=["geometry"]).to_dict())
        mapped = mapper(props, geom)
        if mapped:
            rows.append(mapped)
    return rows


def _map_mining_process(props: dict, geom) -> dict:
    process = str(_first(props, "PROCESSO", "DSProcesso", "processo") or "")
    return {
        "process_number": process,
        "phase": str(_first(props, "FASE", "fase") or ""),
        "holder": str(_first(props, "NOME", "nome", "TITULAR") or ""),
        "substance": str(_first(props, "SUBS", "subs", "SUBSTANCIA") or ""),
        "use_type": str(_first(props, "USO", "uso") or ""),
        "area_ha": float(v) if (v := _first(props, "AREA_HA", "area_ha")) not in (None, "") else None,
        "uf": str(_first(props, "UF", "uf") or ""),
        "last_event": str(_first(props, "ULT_EVENTO", "ult_evento") or ""),
        "attrs": json.dumps(props, ensure_ascii=False),
        "wkt": geom.wkt,
    }


def _map_source_protection(props: dict, geom) -> dict:
    process = str(_first(props, "PROCESSO", "DSProcesso", "processo") or "")
    return {
        "process_number": process,
        "area_ha": float(v) if (v := _first(props, "AREA_HA", "area_ha")) not in (None, "") else None,
        "attrs": json.dumps(props, ensure_ascii=False),
        "wkt": geom.wkt,
    }


def _map_generic(props: dict, geom, *, name_keys: tuple[str, ...], code_key: str = "PROCESSO") -> dict:
    code = str(_first(props, code_key, "DSProcesso", "NOME", "ID") or "")
    name = str(_first(props, *name_keys) or code or "Área ANM")
    return {
        "code": code,
        "name": name,
        "area_ha": float(v) if (v := _first(props, "AREA_HA", "area_ha")) not in (None, "") else None,
        "uf": str(_first(props, "UF", "uf") or ""),
        "attrs": json.dumps(props, ensure_ascii=False),
        "wkt": geom.wkt,
    }


def _ingest_layer(database_url: str, key: str, *, truncate: bool = True) -> int:
    cache_names = {
        "mining_processes": "anm_brasil.zip",
        "source_protection": "anm_protecao_fonte.zip",
        "mining_leases": "anm_arrendamento.zip",
        "mining_blocks": "anm_bloqueio.zip",
        "placer_reserves": "anm_reservas_garimpeiras.zip",
    }
    zip_path = _download(SOURCES[key], cache_names[key])
    gdf = _read_shp_from_zip(zip_path)
    logger.info("%s: %d polígonos", key, len(gdf))

    if key == "mining_processes":
        rows = _rows_from_gdf(gdf, _map_mining_process)
        table = TABLES[key]
        cols = "process_number, phase, holder, substance, use_type, area_ha, uf, last_event, attrs, geom"
        record_def = "(process_number text, phase text, holder text, substance text, use_type text, area_ha float8, uf text, last_event text, attrs text, wkt text)"
        select_sql = "SELECT process_number, phase, holder, substance, use_type, area_ha, uf, last_event, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)"
    elif key == "source_protection":
        rows = _rows_from_gdf(gdf, _map_source_protection)
        table = TABLES[key]
        cols = "process_number, area_ha, attrs, geom"
        record_def = "(process_number text, area_ha float8, attrs text, wkt text)"
        select_sql = "SELECT process_number, area_ha, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)"
    else:
        name_keys = {
            "mining_leases": ("NOME", "DSProcesso", "PROCESSO"),
            "mining_blocks": ("NOME", "DSProcesso", "PROCESSO"),
            "placer_reserves": ("NOME", "DSProcesso", "PROCESSO"),
        }[key]
        rows = _rows_from_gdf(gdf, lambda p, g: _map_generic(p, g, name_keys=name_keys))
        table = TABLES[key]
        cols = "code, name, area_ha, uf, attrs, geom"
        record_def = "(code text, name text, area_ha float8, uf text, attrs text, wkt text)"
        select_sql = "SELECT code, name, area_ha, uf, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)"

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if truncate:
            conn.execute(text(f"TRUNCATE {table} RESTART IDENTITY"))
        if rows:
            _bulk_insert(conn, table, cols, record_def, select_sql, rows)
    logger.info("Ingeridos %d em %s", len(rows), table)
    return len(rows)


def ingest_all(database_url: str) -> dict[str, int]:
    stats: dict[str, int] = {}
    for key in SOURCES:
        stats[key] = _ingest_layer(database_url, key)
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
    )
    stats = ingest_all(url)
    print("OK —", stats)

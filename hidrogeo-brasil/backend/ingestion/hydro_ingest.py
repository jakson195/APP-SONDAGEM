"""Ingestão hidrologia — HydroRIVERS, HydroBASINS, Natural Earth → PostGIS."""

from __future__ import annotations

import json
import logging
import math
import os
import zipfile
from pathlib import Path

import geopandas as gpd
import httpx
from shapely.geometry import MultiLineString, MultiPolygon, Polygon, box
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache"
SEED_RIVERS = ROOT / "data" / "seed" / "rivers-brasil.geojson"

BRAZIL = box(-74, -34, -34, 6)

SOURCES = {
    "rivers": "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_sa_shp.zip",
    "basins_l4": "https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_sa_lev04_v1c.zip",
    "basins_l2": "https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_sa_lev02_v1c.zip",
    "lakes": "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip",
}

BATCH = 800


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


def _download(url: str, filename: str) -> Path:
    path = CACHE_DIR / filename
    if path.exists() and path.stat().st_size > 10_000:
        return path
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    verify = os.environ.get("HYDRO_TLS_VERIFY", "false").lower() in ("1", "true")
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


def _to_multiline(geom):
    if geom.geom_type == "LineString":
        return MultiLineString([geom])
    if geom.geom_type == "MultiLineString":
        return geom
    return None


def _to_multipolygon(geom):
    if geom.geom_type == "Polygon":
        return MultiPolygon([geom])
    if geom.geom_type == "MultiPolygon":
        return geom
    return None


def ingest_rivers(database_url: str, *, truncate: bool = True) -> int:
    zip_path = _download(SOURCES["rivers"], "HydroRIVERS_v10_sa_shp.zip")
    gdf = _read_shp_from_zip(zip_path).to_crs(4326)
    gdf = gdf[gdf.intersects(BRAZIL)].copy()
    logger.info("HydroRIVERS Brasil: %d segmentos", len(gdf))

    rows: list[dict] = []
    for _, row in gdf.iterrows():
        geom = _to_multiline(row.geometry)
        if geom is None:
            continue
        props = row.drop(labels=["geometry"]).to_dict()
        props = _json_safe(props)
        order = int(props.get("ORD_STRA") or props.get("ord_stra") or 1)
        length = props.get("LENGTH_KM") or props.get("length_km")
        name = props.get("RIVERNAME") or props.get("rivername")
        if not name or str(name).strip() in ("", "0", "None"):
            name = f"Curso d'água #{props.get('HYRIV_ID', len(rows) + 1)}"
        rows.append(
            {
                "name": str(name),
                "strahler_order": max(1, min(9, order)),
                "basin": str(props.get("MAIN_BAS") or props.get("PFAF_ID") or ""),
                "hydro_region": None,
                "length_km": float(length) if length not in (None, "") else None,
                "source": "HydroRIVERS v1.0",
                "attrs": json.dumps(props, ensure_ascii=False),
                "wkt": geom.wkt,
            }
        )

    if not rows and SEED_RIVERS.exists():
        logger.warning("HydroRIVERS vazio — seed local")
        with SEED_RIVERS.open(encoding="utf-8") as f:
            seed = gpd.GeoDataFrame.from_features(json.load(f)["features"], crs="EPSG:4326")
        for _, row in seed.iterrows():
            geom = _to_multiline(row.geometry)
            if not geom:
                continue
            p = row.drop(labels=["geometry"]).to_dict()
            rows.append(
                {
                    "name": str(p.get("name", "Rio")),
                    "strahler_order": int(p.get("strahler_order") or 2),
                    "basin": p.get("basin"),
                    "hydro_region": p.get("hydro_region"),
                    "length_km": p.get("length_km"),
                    "source": "seed",
                    "attrs": json.dumps(_json_safe(p), ensure_ascii=False),
                    "wkt": geom.wkt,
                }
            )

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if truncate:
            conn.execute(text("TRUNCATE hydro.rivers RESTART IDENTITY"))
        _bulk_insert(
            conn,
            "hydro.rivers",
            "name, strahler_order, basin, hydro_region, length_km, source, attrs, geom",
            "(name text, strahler_order int, basin text, hydro_region text, length_km float8, source text, attrs text, wkt text)",
            """SELECT name, strahler_order, basin, hydro_region, length_km, source,
                      CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)""",
            rows,
        )
    logger.info("Ingeridos %d rios/córregos", len(rows))
    return len(rows)


def ingest_water_bodies(database_url: str, *, truncate: bool = True) -> int:
    zip_path = _download(SOURCES["lakes"], "ne_10m_lakes.zip")
    gdf = _read_shp_from_zip(zip_path).to_crs(4326)
    gdf = gdf[gdf.intersects(BRAZIL)].copy()
    logger.info("Lagos/corpos d'água Brasil: %d", len(gdf))

    rows: list[dict] = []
    for _, row in gdf.iterrows():
        geom = _to_multipolygon(row.geometry)
        if geom is None:
            continue
        props = _json_safe(row.drop(labels=["geometry"]).to_dict())
        name = props.get("name") or props.get("NAME") or "Corpo hídrico"
        area = props.get("scalerank")
        rows.append(
            {
                "name": str(name),
                "type": str(props.get("featurecla") or "Lago"),
                "area_km2": None,
                "attrs": json.dumps(props, ensure_ascii=False),
                "wkt": geom.wkt,
            }
        )

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if truncate:
            conn.execute(text("TRUNCATE hydro.water_bodies RESTART IDENTITY"))
        _bulk_insert(
            conn,
            "hydro.water_bodies",
            "name, type, area_km2, attrs, geom",
            "(name text, type text, area_km2 float8, attrs text, wkt text)",
            "SELECT name, type, area_km2, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)",
            rows,
        )
    logger.info("Ingeridos %d corpos hídricos", len(rows))
    return len(rows)


def _ingest_basins_table(
    database_url: str,
    zip_key: str,
    cache_name: str,
    table: str,
    *,
    truncate: bool,
    name_prefix: str,
) -> int:
    zip_path = _download(SOURCES[zip_key], cache_name)
    gdf = _read_shp_from_zip(zip_path).to_crs(4326)
    gdf = gdf[gdf.intersects(BRAZIL)].copy()
    logger.info("%s Brasil: %d polígonos", table, len(gdf))

    rows: list[dict] = []
    for _, row in gdf.iterrows():
        geom = _to_multipolygon(row.geometry)
        if geom is None:
            continue
        props = _json_safe(row.drop(labels=["geometry"]).to_dict())
        code = str(props.get("HYBAS_ID") or props.get("PFAF_ID") or len(rows) + 1)
        sub_area = props.get("SUB_AREA")
        name = f"{name_prefix} {code}"
        if sub_area:
            name = f"{name_prefix} {code} ({float(sub_area):,.0f} km²)"
        rows.append(
            {
                "code": code,
                "name": name,
                "attrs": json.dumps(props, ensure_ascii=False),
                "wkt": geom.wkt,
            }
        )

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if truncate:
            conn.execute(text(f"TRUNCATE {table} RESTART IDENTITY"))
        _bulk_insert(
            conn,
            table,
            "code, name, attrs, geom",
            "(code text, name text, attrs text, wkt text)",
            "SELECT code, name, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326)",
            rows,
        )
    logger.info("Ingeridos %d em %s", len(rows), table)
    return len(rows)


def ingest_basins(database_url: str, *, truncate: bool = True) -> int:
    return _ingest_basins_table(
        database_url,
        "basins_l4",
        "hybas_sa_lev04_v1c.zip",
        "hydro.basins",
        truncate=truncate,
        name_prefix="Bacia",
    )


def ingest_hydro_regions(database_url: str, *, truncate: bool = True) -> int:
    return _ingest_basins_table(
        database_url,
        "basins_l2",
        "hybas_sa_lev02_v1c.zip",
        "hydro.hydro_regions",
        truncate=truncate,
        name_prefix="Região hidrográfica",
    )


def _enrich_hydro_regions(conn) -> None:
    """Atribui região hidrográfica por lote (rápido)."""
    conn.execute(
        text(
            """
            UPDATE hydro.rivers r
            SET hydro_region = hr.name
            FROM hydro.hydro_regions hr
            WHERE r.hydro_region IS NULL
              AND ST_Intersects(ST_Centroid(r.geom), hr.geom)
            """
        )
    )


def ingest_derived_hydro(database_url: str, *, enrich_regions: bool = False) -> dict[str, int]:
    """Popula cursos secundários (ordem 1–2) e nascentes a partir de hydro.rivers."""
    engine = create_engine(database_url)
    with engine.begin() as conn:
        if enrich_regions:
            logger.info("A enriquecer regiões hidrográficas…")
            _enrich_hydro_regions(conn)
        conn.execute(text("TRUNCATE hydro.secondary_streams RESTART IDENTITY"))
        conn.execute(
            text(
                """
                INSERT INTO hydro.secondary_streams
                    (name, strahler_order, basin, hydro_region, length_km, source, attrs, geom)
                SELECT name, strahler_order, basin, hydro_region, length_km, source, attrs, geom
                FROM hydro.rivers
                WHERE strahler_order <= 2
                """
            )
        )
        conn.execute(text("TRUNCATE hydro.springs RESTART IDENTITY"))
        conn.execute(
            text(
                """
                WITH heads AS (
                    SELECT
                        r.id,
                        r.name,
                        r.strahler_order,
                        r.basin,
                        r.source,
                        r.attrs,
                        ST_StartPoint((ST_Dump(r.geom)).geom)::geometry(Point, 4326) AS pt
                    FROM hydro.rivers r
                    WHERE r.strahler_order = 1
                )
                INSERT INTO hydro.springs (name, stream_name, strahler_order, basin, source, attrs, geom)
                SELECT
                    'Nascente — ' || name,
                    name,
                    strahler_order,
                    basin,
                    source,
                    attrs,
                    pt
                FROM (
                    SELECT DISTINCT ON (ST_SnapToGrid(pt, 0.0005))
                        id, name, strahler_order, basin, source, attrs, pt
                    FROM heads
                    ORDER BY ST_SnapToGrid(pt, 0.0005), id
                ) deduped
                """
            )
        )
        secondary_count = conn.execute(text("SELECT COUNT(*) FROM hydro.secondary_streams")).scalar() or 0
        springs_count = conn.execute(text("SELECT COUNT(*) FROM hydro.springs")).scalar() or 0

    logger.info("Derivados: %d cursos secundários, %d nascentes", secondary_count, springs_count)
    return {"secondary_streams": secondary_count, "springs": springs_count}


def ingest_all(database_url: str) -> dict[str, int]:
    stats = {
        "rivers": ingest_rivers(database_url),
        "water_bodies": ingest_water_bodies(database_url),
        "basins": ingest_basins(database_url),
        "hydro_regions": ingest_hydro_regions(database_url),
    }
    stats.update(ingest_derived_hydro(database_url))
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
    )
    if os.environ.get("DERIVED_ONLY", "").lower() in ("1", "true", "yes"):
        enrich = os.environ.get("ENRICH_REGIONS", "").lower() in ("1", "true", "yes")
        stats = ingest_derived_hydro(url, enrich_regions=enrich)
    else:
        stats = ingest_all(url)
    print("OK —", stats)

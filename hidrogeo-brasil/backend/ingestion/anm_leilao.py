"""Ingestão ANM — processos por UF (SIGMINE) + metadados SOPLE."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, text

from ingestion.anm_sigmine import (
    _bulk_insert,
    _download,
    _map_mining_process,
    _read_shp_from_zip,
    _rows_from_gdf,
)

logger = logging.getLogger(__name__)

PROCESSOS_BASE = "https://dadosabertos.anm.gov.br/SIGMINE/PROCESSOS_MINERARIOS"

UF_LIST = [
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
    "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
    "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]


def download_sigmine_uf(uf: str):
    """Baixa shapefile SIGMINE de uma UF e retorna GeoDataFrame."""
    uf = uf.upper()
    url = f"{PROCESSOS_BASE}/{uf}.zip"
    zip_path = _download(url, f"sigmine_{uf}.zip")
    return _read_shp_from_zip(zip_path)


def _log_sync(
    conn,
    *,
    uf: str,
    status: str,
    message: str | None = None,
    areas: int = 0,
    progress_pct: int = 0,
) -> None:
    conn.execute(
        text(
            """
            INSERT INTO mining.sync_jobs (job_type, uf, status, progress_pct, message, areas_imported, finished_at)
            VALUES (
              'sigmine_uf', :uf, :status, :pct, :msg, :areas,
              CASE WHEN :status IN ('done', 'failed') THEN NOW() ELSE NULL END
            )
            """
        ),
        {"uf": uf, "status": status, "pct": progress_pct, "msg": message, "areas": areas},
    )


def upsert_mining_processes_uf(database_url: str, uf: str, gdf) -> int:
    """Upsert SIGMINE por UF — preserva metadados de leilão (rodada, edital)."""
    rows = _rows_from_gdf(gdf, _map_mining_process)
    if not rows:
        return 0

    for row in rows:
        if not row.get("uf"):
            row["uf"] = uf.upper()

    table = "mining.mining_processes"
    cols = (
        "process_number, phase, holder, substance, use_type, area_ha, uf, "
        "last_event, attrs, geom, updated_at"
    )
    record_def = (
        "(process_number text, phase text, holder text, substance text, use_type text, "
        "area_ha float8, uf text, last_event text, attrs text, wkt text)"
    )
    select_sql = (
        "SELECT process_number, phase, holder, substance, use_type, area_ha, uf, "
        "last_event, CAST(attrs AS jsonb), ST_GeomFromText(wkt, 4326), NOW()"
    )

    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                INSERT INTO {table} ({cols})
                {select_sql}
                FROM json_to_recordset(CAST(:payload AS json)) AS x{record_def}
                ON CONFLICT (process_number) DO UPDATE SET
                  phase = EXCLUDED.phase,
                  holder = EXCLUDED.holder,
                  substance = EXCLUDED.substance,
                  use_type = EXCLUDED.use_type,
                  area_ha = EXCLUDED.area_ha,
                  uf = EXCLUDED.uf,
                  last_event = EXCLUDED.last_event,
                  attrs = EXCLUDED.attrs,
                  geom = EXCLUDED.geom,
                  updated_at = NOW()
                """
            ),
            {"payload": json.dumps(rows, ensure_ascii=False, allow_nan=False)},
        )

    logger.info("Importados %d processos (%s)", len(rows), uf)
    return len(rows)


def refresh_leilao_after_sync(database_url: str) -> dict:
    from app.services.leilao_prediction import refresh_leilao_predictions

    engine = create_engine(database_url)
    with engine.begin() as conn:
        return refresh_leilao_predictions(conn)


def sync_sigmine_uf(database_url: str, uf: str, *, job_id: str | None = None) -> int:
    """Download + upsert SIGMINE para uma UF."""
    del job_id  # reservado para Celery task id futuro
    uf = uf.upper()
    engine = create_engine(database_url)
    try:
        with engine.begin() as conn:
            _log_sync(conn, uf=uf, status="running", progress_pct=10, message=f"Baixando {uf}.zip")
        gdf = download_sigmine_uf(uf)
        with engine.begin() as conn:
            _log_sync(conn, uf=uf, status="running", progress_pct=60, message="Gravando PostGIS")
        count = upsert_mining_processes_uf(database_url, uf, gdf)
        prediction = refresh_leilao_after_sync(database_url)
        with engine.begin() as conn:
            _log_sync(
                conn, uf=uf, status="done", progress_pct=100,
                message=f"{count} áreas · previstas {prediction.get('porCategoria', {}).get('prevista', 0)}",
                areas=count,
            )
        return count
    except Exception as exc:
        logger.exception("Sync %s falhou", uf)
        with engine.begin() as conn:
            _log_sync(conn, uf=uf, status="failed", progress_pct=0, message=str(exc))
        raise


def seed_leilao_rodadas(database_url: str) -> int:
    """Garante metadados das rodadas SOPLE + camada prevista."""
    base = os.path.join(
        os.path.dirname(__file__), "..", "..", "data", "scripts"
    )
    engine = create_engine(database_url)
    n = 0
    for name in ("migrate_mining_leilao.sql", "migrate_mining_leilao_upcoming.sql"):
        path = os.path.join(base, name)
        if not os.path.isfile(path):
            continue
        sql = open(path, encoding="utf-8").read()
        with engine.begin() as conn:
            conn.execute(text(sql))
        n += 1
    return n


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Sync ANM SIGMINE por UF")
    parser.add_argument("--uf", default="MG", help="UF a importar (default: MG)")
    parser.add_argument(
        "--db",
        default=os.environ.get(
            "DATABASE_URL_SYNC",
            "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
        ),
    )
    args = parser.parse_args()
    n = sync_sigmine_uf(args.db, args.uf)
    print(f"OK — {args.uf}: {n} processos")

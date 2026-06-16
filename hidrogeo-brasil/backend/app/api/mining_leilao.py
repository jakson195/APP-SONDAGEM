"""API — ANM Leilão SOPLE + SIGMINE."""

from __future__ import annotations

import asyncio
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.mining import enrich_mining_feature

router = APIRouter()


def _run_sync_uf(uf: str) -> None:
    from ingestion.anm_leilao import sync_sigmine_uf

    sync_sigmine_uf(settings.database_url_sync, uf.upper())


class SyncRequest(BaseModel):
    uf: str | None = None


class EditalImportRequest(BaseModel):
    rodada: int
    process_numbers: list[str]
    data_leilao: date | None = None
    data_oferta_pub: date | None = None


def _run_predict() -> dict:
    from sqlalchemy import create_engine

    from app.services.leilao_prediction import refresh_leilao_predictions

    engine = create_engine(settings.database_url_sync)
    with engine.begin() as conn:
        return refresh_leilao_predictions(conn)


def _run_seed_migrations() -> None:
    from ingestion.anm_leilao import seed_leilao_rodadas

    seed_leilao_rodadas(settings.database_url_sync)


@router.get("/leiloes")
async def list_leiloes(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            text(
                """
                SELECT
                  r.rodada,
                  r.nome,
                  r.data_leilao,
                  r.data_oferta_pub,
                  r.data_encerramento,
                  COALESCE(c.areas_count, 0) AS areas_count
                FROM mining.leilao_rodadas r
                LEFT JOIN (
                  SELECT rodada_exibicao AS rodada, COUNT(*) AS areas_count
                  FROM public.mining_leilao_areas
                  WHERE rodada_exibicao IS NOT NULL
                  GROUP BY rodada_exibicao
                ) c ON c.rodada = r.rodada
                ORDER BY r.rodada
                """
            )
        )
    ).mappings().all()
    return {"rodadas": [dict(r) for r in rows]}


@router.get("/leiloes/upcoming")
async def upcoming_summary(db: AsyncSession = Depends(get_db)):
    try:
        rows = (
            await db.execute(
                text(
                    """
                    SELECT leilao_categoria, COUNT(*) AS n
                    FROM public.mining_leilao_areas
                    GROUP BY leilao_categoria
                    ORDER BY leilao_categoria
                    """
                )
            )
        ).mappings().all()
    except Exception:
        rows = []
    proxima = (
        await db.execute(
            text(
                """
                SELECT rodada, nome, data_leilao, data_oferta_pub
                FROM mining.leilao_rodadas
                WHERE COALESCE(data_leilao, data_oferta_pub) >= CURRENT_DATE
                   OR rodada = (SELECT MAX(rodada) + 1 FROM mining.leilao_rodadas)
                ORDER BY COALESCE(data_leilao, data_oferta_pub) ASC NULLS LAST, rodada ASC
                LIMIT 1
                """
            )
        )
    ).mappings().first()
    return {
        "proximaRodada": dict(proxima) if proxima else None,
        "porCategoria": {str(r["leilao_categoria"]): int(r["n"]) for r in rows},
    }


@router.post("/enrich/predict")
async def run_prediction():
    try:
        result = await asyncio.to_thread(_run_predict)
        return {"status": "ok", **result}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/edital/import")
async def import_edital(body: EditalImportRequest, db: AsyncSession = Depends(get_db)):
    if not body.process_numbers:
        raise HTTPException(400, "Lista process_numbers vazia")
    for pn in body.process_numbers:
        await db.execute(
            text(
                """
                INSERT INTO mining.leilao_edital_processos
                  (process_number, rodada, data_leilao, data_oferta_pub, status_leilao)
                VALUES (:pn, :rodada, :dl, :dp, 'CONFIRMADA')
                ON CONFLICT (process_number, rodada) DO UPDATE SET
                  data_leilao = COALESCE(EXCLUDED.data_leilao, mining.leilao_edital_processos.data_leilao),
                  data_oferta_pub = COALESCE(EXCLUDED.data_oferta_pub, mining.leilao_edital_processos.data_oferta_pub)
                """
            ),
            {
                "pn": pn.strip(),
                "rodada": body.rodada,
                "dl": body.data_leilao,
                "dp": body.data_oferta_pub,
            },
        )
    await db.commit()
    result = await asyncio.to_thread(_run_predict)
    return {"imported": len(body.process_numbers), "rodada": body.rodada, "prediction": result}


@router.post("/migrate/seed")
async def migrate_seed():
    """Aplica migrações SQL leilão (dev)."""
    try:
        await asyncio.to_thread(_run_seed_migrations)
        result = await asyncio.to_thread(_run_predict)
        return {"status": "ok", "prediction": result}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/areas")
async def list_areas(
    uf: str | None = None,
    fase: str | None = None,
    rodada: int | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    substancia: str | None = None,
    bbox: str | None = None,
    limit: int = Query(1000, le=5000),
    db: AsyncSession = Depends(get_db),
):
    clauses = ["1=1"]
    params: dict = {"lim": limit}

    if uf:
        clauses.append("uf = :uf")
        params["uf"] = uf.upper()
    if fase:
        clauses.append("phase ILIKE :fase")
        params["fase"] = f"%{fase}%"
    if rodada is not None:
        clauses.append("rodada = :rodada")
        params["rodada"] = rodada
    if data_inicio:
        clauses.append("data_leilao >= :d0")
        params["d0"] = data_inicio
    if data_fim:
        clauses.append("data_leilao <= :d1")
        params["d1"] = data_fim
    if substancia:
        clauses.append("substance ILIKE :subs")
        params["subs"] = f"%{substancia}%"
    if bbox:
        parts = [float(x) for x in bbox.split(",")]
        if len(parts) == 4:
            clauses.append(
                "ST_Intersects(geom, ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326))"
            )
            params.update({"minx": parts[0], "miny": parts[1], "maxx": parts[2], "maxy": parts[3]})

    where = " AND ".join(clauses)
    sql = f"""
        SELECT
          id, process_number, phase, holder, substance, area_ha, uf,
          rodada, data_leilao, data_oferta_pub, valor_minimo, status_leilao,
          ST_AsGeoJSON(geom)::json AS geometry
        FROM mining.mining_processes
        WHERE {where}
        ORDER BY process_number
        LIMIT :lim
    """
    rows = (await db.execute(text(sql), params)).mappings().all()
    features = []
    for r in rows:
        d = dict(r)
        geom = d.pop("geometry", None)
        features.append({"type": "Feature", "properties": d, "geometry": geom})
    return {"type": "FeatureCollection", "features": features, "count": len(features)}


@router.get("/areas/{processo}")
async def get_area(processo: str, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(
            text(
                """
                SELECT
                  id, process_number, phase, holder, substance, use_type, area_ha, uf,
                  rodada, data_leilao, data_oferta_pub, valor_minimo, status_leilao, vencedor,
                  last_event, attrs,
                  ST_AsGeoJSON(geom)::json AS geometry
                FROM mining.mining_processes
                WHERE process_number = :p
                """
            ),
            {"p": processo},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Processo não encontrado")
    data = dict(row)
    geom = data.pop("geometry", None)
    feature = enrich_mining_feature(
        {
            "process_number": data.get("process_number"),
            "phase": data.get("phase"),
            "holder": data.get("holder"),
            "substance": data.get("substance"),
            "area_ha": data.get("area_ha"),
            "uf": data.get("uf"),
            "rodada": data.get("rodada"),
            "data_leilao": str(data["data_leilao"]) if data.get("data_leilao") else None,
            "data_oferta_pub": str(data["data_oferta_pub"]) if data.get("data_oferta_pub") else None,
            "valor_minimo": float(data["valor_minimo"]) if data.get("valor_minimo") else None,
            "status_leilao": data.get("status_leilao"),
        }
    )
    feature["geometry"] = geom
    feature["link_sigmine"] = f"https://geo.anm.gov.br/"
    feature["link_scm"] = f"https://sistemas.anm.gov.br/SCM/Extra/site/consulta/"
    feature["link_sople"] = "https://sople.anm.gov.br/"
    return feature


@router.post("/import/sync")
async def trigger_sync(body: SyncRequest):
    if not body.uf:
        raise HTTPException(400, "Indique a UF (uf) para sincronizar")

    uf = body.uf.upper()
    use_celery = os.environ.get("MINING_SYNC_CELERY", "").lower() in ("1", "true", "yes")

    if use_celery:
        try:
            from app.tasks.mining_sync import sync_uf_task

            import redis

            redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
            client = redis.from_url(redis_url, socket_connect_timeout=1)
            client.ping()
            task = sync_uf_task.delay(uf)
            return {"taskId": task.id, "uf": uf, "status": "queued", "mode": "celery"}
        except Exception:
            pass

    asyncio.create_task(asyncio.to_thread(_run_sync_uf, uf))
    return {"uf": uf, "status": "running", "mode": "inline"}


@router.get("/import/status")
async def import_status(db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(
            text(
                """
                SELECT id, uf, status, progress_pct, message, areas_imported, started_at, finished_at
                FROM mining.sync_jobs
                ORDER BY id DESC
                LIMIT 1
                """
            )
        )
    ).mappings().first()
    total = (
        await db.execute(text("SELECT COUNT(*) AS n FROM mining.mining_processes"))
    ).scalar()
    leilao = (
        await db.execute(
            text("SELECT COUNT(*) FROM public.mining_leilao_areas")
        )
    ).scalar()
    upcoming = (
        await db.execute(
            text(
                """
                SELECT COUNT(*) FROM public.mining_leilao_areas
                WHERE leilao_categoria IN ('confirmada', 'prevista')
                """
            )
        )
    ).scalar()
    return {
        "lastJob": dict(row) if row else None,
        "totalAreas": total,
        "leilaoAreas": leilao,
        "upcomingAreas": upcoming,
    }

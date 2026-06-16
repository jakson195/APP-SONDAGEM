"""Celery tasks — ingestão ANM."""

from __future__ import annotations

import os

from app.celery_app import celery_app


def _db_url() -> str:
    return os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
    )


@celery_app.task(name="app.tasks.mining_sync.sync_uf_task", bind=True)
def sync_uf_task(self, uf: str) -> dict:
    from ingestion.anm_leilao import sync_sigmine_uf

    return sync_sigmine_uf(_db_url(), uf.upper(), job_id=getattr(self.request, "id", None))


@celery_app.task(name="app.tasks.mining_sync.sync_all_ufs_task")
def sync_all_ufs_task() -> dict:
    from ingestion.anm_leilao import UF_LIST, sync_sigmine_uf

    url = _db_url()
    stats: dict[str, int] = {}
    for uf in UF_LIST:
        stats[uf] = sync_sigmine_uf(url, uf)
    return stats

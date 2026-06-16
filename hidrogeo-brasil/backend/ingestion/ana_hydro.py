"""Ingestão hidrografia — ver hydro_ingest.py."""

from __future__ import annotations

from hydro_ingest import ingest_all, ingest_rivers

__all__ = ["ingest_rivers", "ingest_all"]

if __name__ == "__main__":
    import logging
    import os

    logging.basicConfig(level=logging.INFO)
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
    )
    stats = ingest_all(url)
    print(f"OK — {stats}")

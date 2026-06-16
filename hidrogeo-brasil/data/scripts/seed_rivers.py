#!/usr/bin/env python3
"""Seed hidrografia ANA no PostGIS local."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from ingestion.ana_hydro import ingest_rivers

if __name__ == "__main__":
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo",
    )
    n = ingest_rivers(url)
    print(f"Seed OK — {n} rios")

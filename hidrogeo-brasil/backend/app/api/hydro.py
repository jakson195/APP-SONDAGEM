"""Dados hidrológicos — vazão, bacias por exutório."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter()

# Curvas sazonais simplificadas por bacia (Jan=1 … Dez=12)
# Amazônica: cheia mar–jun; SF: chuvas dez–mar; Sul: inverno seco
BASIN_CURVES: dict[str, list[float]] = {
    "Amazônica": [0.95, 0.92, 0.88, 0.75, 0.55, 0.45, 0.42, 0.48, 0.55, 0.65, 0.78, 0.88],
    "São Francisco": [0.55, 0.50, 0.45, 0.35, 0.25, 0.20, 0.18, 0.22, 0.30, 0.42, 0.65, 0.85],
    "Paraná": [0.70, 0.65, 0.55, 0.45, 0.35, 0.30, 0.28, 0.32, 0.40, 0.55, 0.72, 0.82],
    "Tocantins-Araguaia": [0.90, 0.88, 0.82, 0.70, 0.50, 0.40, 0.38, 0.45, 0.55, 0.68, 0.80, 0.88],
    "Itajaí": [0.75, 0.70, 0.60, 0.45, 0.35, 0.30, 0.32, 0.38, 0.48, 0.58, 0.68, 0.78],
    "Doce": [0.72, 0.68, 0.58, 0.42, 0.32, 0.28, 0.30, 0.35, 0.45, 0.55, 0.68, 0.80],
    "default": [0.60, 0.58, 0.52, 0.42, 0.32, 0.28, 0.30, 0.35, 0.45, 0.55, 0.65, 0.72],
}

MONTH_LABELS = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]


@router.get("/flow-index")
async def flow_index(month: int = 1):
    """Índice de vazão relativa (0–1) por bacia para colorir rios."""
    m = max(1, min(12, month))
    idx = m - 1
    by_basin = {k: v[idx] for k, v in BASIN_CURVES.items() if k != "default"}
    return {
        "month": m,
        "label": MONTH_LABELS[idx],
        "byBasin": by_basin,
        "default": BASIN_CURVES["default"][idx],
        "months": MONTH_LABELS,
    }


@router.get("/rivers")
async def rivers_flow_series():
    """Série mensal completa por bacia (gráficos / animação)."""
    return {
        "months": MONTH_LABELS,
        "series": {k: v for k, v in BASIN_CURVES.items() if k != "default"},
    }


def _parse_attrs(raw) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


@router.get("/basin-by-outlet")
async def basin_by_outlet(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    snap: bool = Query(True, description="Ajustar ao curso d'água mais próximo"),
    snap_m: float = Query(2500, ge=100, le=10000, description="Raio de snap ao rio (m)"),
    db: AsyncSession = Depends(get_db),
):
    """Delimita a bacia hidrográfica que contém o ponto exutório (HydroBASINS nível 4)."""
    q = text(
        """
        WITH input_pt AS (
            SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS geom
        ),
        snapped_pt AS (
            SELECT CASE
                WHEN :snap THEN COALESCE(
                    (
                        SELECT ST_ClosestPoint(r.geom, p.geom)
                        FROM hydro.rivers r, input_pt p
                        WHERE ST_DWithin(r.geom::geography, p.geom::geography, :snap_m)
                        ORDER BY ST_Distance(r.geom::geography, p.geom::geography)
                        LIMIT 1
                    ),
                    (SELECT geom FROM input_pt)
                )
                ELSE (SELECT geom FROM input_pt)
            END AS geom,
            CASE
                WHEN :snap AND EXISTS (
                    SELECT 1 FROM hydro.rivers r, input_pt p
                    WHERE ST_DWithin(r.geom::geography, p.geom::geography, :snap_m)
                ) THEN TRUE
                ELSE FALSE
            END AS snapped
        ),
        outlet AS (
            SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, snapped
            FROM snapped_pt
        ),
        nearest_river AS (
            SELECT
                r.id, r.name, r.strahler_order, r.basin, r.attrs,
                ST_Distance(r.geom::geography, s.geom::geography) AS distance_m
            FROM hydro.rivers r
            CROSS JOIN snapped_pt s
            WHERE ST_DWithin(r.geom::geography, s.geom::geography, :snap_m)
            ORDER BY distance_m
            LIMIT 1
        ),
        basin_l4 AS (
            SELECT
                b.id, b.code, b.name, b.attrs,
                ST_Area(b.geom::geography) / 1e6 AS area_km2,
                ST_AsGeoJSON(b.geom)::json AS geometry,
                'basin'::text AS level
            FROM hydro.basins b
            CROSS JOIN snapped_pt s
            WHERE ST_Contains(b.geom, s.geom)
            ORDER BY ST_Area(b.geom::geography) ASC
            LIMIT 1
        ),
        basin_l2 AS (
            SELECT
                hr.id, hr.code, hr.name, hr.attrs,
                ST_Area(hr.geom::geography) / 1e6 AS area_km2,
                ST_AsGeoJSON(hr.geom)::json AS geometry,
                'region'::text AS level
            FROM hydro.hydro_regions hr
            CROSS JOIN snapped_pt s
            WHERE ST_Contains(hr.geom, s.geom)
            ORDER BY ST_Area(hr.geom::geography) ASC
            LIMIT 1
        ),
        chosen AS (
            SELECT * FROM basin_l4
            UNION ALL
            SELECT * FROM basin_l2 WHERE NOT EXISTS (SELECT 1 FROM basin_l4)
            LIMIT 1
        )
        SELECT
            (SELECT row_to_json(outlet) FROM outlet) AS outlet,
            (SELECT row_to_json(nearest_river) FROM nearest_river) AS river,
            (SELECT row_to_json(chosen) FROM chosen) AS basin
        """
    )
    row = (await db.execute(q, {"lon": lon, "lat": lat, "snap": snap, "snap_m": snap_m})).mappings().first()
    if not row:
        raise HTTPException(500, "Erro ao calcular bacia")

    outlet = row["outlet"] or {"lon": lon, "lat": lat, "snapped": False}
    river_raw = row["river"]
    basin_raw = row["basin"]

    river = None
    if river_raw:
        attrs = _parse_attrs(river_raw.get("attrs"))
        up_area = attrs.get("UP_AREA") or attrs.get("up_area")
        river = {
            "id": river_raw["id"],
            "name": river_raw.get("name"),
            "strahler_order": river_raw.get("strahler_order"),
            "basin": river_raw.get("basin"),
            "hyriv_id": str(attrs.get("HYRIV_ID") or attrs.get("hyriv_id") or ""),
            "upstream_area_km2": float(up_area) if up_area not in (None, "") else None,
            "distance_m": round(float(river_raw.get("distance_m") or 0), 1),
        }

    if not basin_raw:
        return {
            "found": False,
            "message": "Nenhuma bacia hidrográfica contém este ponto. Verifique se os dados HydroBASINS foram ingeridos.",
            "outlet": outlet,
            "river": river,
        }

    attrs = _parse_attrs(basin_raw.get("attrs"))
    sub_area = attrs.get("SUB_AREA") or attrs.get("sub_area")
    basin = {
        "id": basin_raw["id"],
        "code": basin_raw.get("code"),
        "name": basin_raw.get("name"),
        "level": basin_raw.get("level"),
        "area_km2": round(float(basin_raw.get("area_km2") or 0), 1),
        "sub_area_km2": round(float(sub_area), 1) if sub_area not in (None, "") else None,
        "geometry": basin_raw.get("geometry"),
    }

    return {
        "found": True,
        "outlet": outlet,
        "river": river,
        "basin": basin,
    }

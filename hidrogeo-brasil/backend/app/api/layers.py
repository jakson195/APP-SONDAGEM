from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.geology import enrich_lithology_feature
from app.services.mining import enrich_mining_feature

router = APIRouter()


@router.get("")
async def list_layers():
    return {
        "groups": [
            {
                "id": "hydro",
                "label": "Hidrografia",
                "layers": [
                    {
                        "id": "rivers",
                        "label": "Rios principais (ord. ≥5)",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.rivers/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "stream_category_1",
                        "label": "Córrego — 1ª categoria",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.stream_category_1/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "stream_category_2",
                        "label": "Córrego — 2ª categoria",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.stream_category_2/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "stream_category_3",
                        "label": "Córrego — 3ª categoria",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.stream_category_3/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "stream_category_4",
                        "label": "Córrego — 4ª categoria",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.stream_category_4/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "springs",
                        "label": "Nascentes",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.springs/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "water_bodies",
                        "label": "Corpos hídricos",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.water_bodies/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "hydro_regions",
                        "label": "Regiões hidrográficas",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.hydro_regions/{z}/{x}/{y}.pbf",
                        "defaultVisible": False,
                    },
                    {
                        "id": "basins",
                        "label": "Bacias hidrográficas",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.basins/{z}/{x}/{y}.pbf",
                        "defaultVisible": False,
                    },
                ],
            },
            {
                "id": "geo",
                "label": "Geologia",
                "layers": [
                    {
                        "id": "lithology",
                        "label": "Litologia (CPRM/SGB)",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.lithology/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                ],
            },
            {
                "id": "admin",
                "label": "Limites administrativos",
                "layers": [
                    {
                        "id": "states",
                        "label": "Divisa — Estados (UF)",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.states/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "municipalities",
                        "label": "Divisa — Municípios",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.municipalities/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                ],
            },
            {
                "id": "mining",
                "label": "Mineração (ANM)",
                "layers": [
                    {
                        "id": "mining_leilao_areas",
                        "label": "Áreas de leilão SOPLE",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.mining_leilao_areas/{z}/{x}/{y}.pbf",
                        "defaultVisible": True,
                    },
                    {
                        "id": "mining_processes",
                        "label": "Processos minerários",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.mining_processes/{z}/{x}/{y}.pbf",
                        "defaultVisible": False,
                    },
                    {
                        "id": "source_protection",
                        "label": "Proteção de fonte",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.source_protection/{z}/{x}/{y}.pbf",
                        "defaultVisible": False,
                    },
                    {
                        "id": "mining_blocks",
                        "label": "Áreas de bloqueio",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.mining_blocks/{z}/{x}/{y}.pbf",
                        "defaultVisible": False,
                    },
                    {
                        "id": "placer_reserves",
                        "label": "Reservas garimpeiras",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.placer_reserves/{z}/{x}/{y}.pbf",
                        "defaultVisible": False,
                    },
                    {
                        "id": "mining_leases",
                        "label": "Arrendamentos",
                        "type": "mvt",
                        "tileTemplate": "/tiles/public.mining_leases/{z}/{x}/{y}.pbf",
                        "defaultVisible": False,
                    },
                ],
            },
        ],
        "basemaps": [
            {"id": "satellite", "label": "Satélite"},
            {"id": "terrain", "label": "Terreno"},
            {"id": "dark", "label": "Escuro"},
        ],
    }


@router.get("/features/{layer_id}/{feature_id}")
async def get_feature(layer_id: str, feature_id: int, db: AsyncSession = Depends(get_db)):
    table_map = {
        "rivers": ("public.rivers", "name, strahler_order, basin, hydro_region, length_km, source, attrs"),
        "stream_category_1": (
            "public.stream_category_1",
            "name, strahler_order, stream_category, basin, hydro_region, length_km, source, attrs",
        ),
        "stream_category_2": (
            "public.stream_category_2",
            "name, strahler_order, stream_category, basin, hydro_region, length_km, source, attrs",
        ),
        "stream_category_3": (
            "public.stream_category_3",
            "name, strahler_order, stream_category, basin, hydro_region, length_km, source, attrs",
        ),
        "stream_category_4": (
            "public.stream_category_4",
            "name, strahler_order, stream_category, basin, hydro_region, length_km, source, attrs",
        ),
        "secondary_streams": (
            "hydro.secondary_streams",
            "name, strahler_order, basin, hydro_region, length_km, source, attrs",
        ),
        "springs": ("hydro.springs", "name, stream_name, strahler_order, basin, source, attrs"),
        "water_bodies": ("hydro.water_bodies", "name, type, area_km2, attrs"),
        "hydro_regions": ("hydro.hydro_regions", "code, name, attrs"),
        "basins": ("hydro.basins", "code, name, attrs"),
        "lithology": ("geo.lithology", "unit_name, rock_type, age, description, attrs"),
        "states": ("admin.states", "code, uf, name, region, attrs"),
        "municipalities": ("admin.municipalities", "code, name, uf, state_name, attrs"),
        "mining_leilao_areas": (
            "mining.mining_processes",
            "process_number, phase, holder, substance, use_type, area_ha, uf, rodada, data_leilao, data_oferta_pub, valor_minimo, status_leilao, last_event, attrs",
        ),
        "mining_processes": (
            "mining.mining_processes",
            "process_number, phase, holder, substance, use_type, area_ha, uf, last_event, attrs",
        ),
        "source_protection": ("mining.source_protection", "process_number, area_ha, attrs"),
        "mining_blocks": ("mining.mining_blocks", "code, name, area_ha, uf, attrs"),
        "placer_reserves": ("mining.placer_reserves", "code, name, area_ha, uf, attrs"),
        "mining_leases": ("mining.mining_leases", "code, name, area_ha, uf, attrs"),
    }
    if layer_id not in table_map:
        raise HTTPException(404, "Camada não encontrada")

    table, cols = table_map[layer_id]
    q = text(
        f"""
        SELECT id, {cols},
               ST_AsGeoJSON(geom)::json AS geometry
        FROM {table} WHERE id = :fid
        """
    )
    row = (await db.execute(q, {"fid": feature_id})).mappings().first()
    if not row:
        raise HTTPException(404, "Elemento não encontrado")
    return dict(row)


@router.get("/features/identify")
async def identify_feature(
    lon: float = Query(...),
    lat: float = Query(...),
    layers: str = Query("lithology,mining_processes,source_protection,rivers,municipalities,states"),
    db: AsyncSession = Depends(get_db),
):
    """Identifica feição no ponto — mineração ANM tem prioridade quando solicitada."""
    requested = [x.strip() for x in layers.split(",") if x.strip()]
    results = []

    async def _append_mining(layer_key: str, sql: str) -> None:
        if layer_key not in requested:
            return
        row = (await db.execute(text(sql), {"lon": lon, "lat": lat})).mappings().first()
        if row:
            feature = dict(row)
            if layer_key == "source_protection" and not feature.get("name"):
                feature["name"] = feature.get("process_number")
            if layer_key.startswith("mining") or layer_key == "source_protection":
                feature = enrich_mining_feature(feature)
            elif layer_key == "lithology":
                feature = enrich_lithology_feature(feature)
            results.append({"layer": layer_key, "feature": feature})

    await _append_mining(
        "mining_leilao_areas",
        """
        SELECT id, process_number, phase, holder, substance, use_type, area_ha, uf,
               rodada, data_leilao, data_oferta_pub, valor_minimo, status_leilao, last_event, attrs,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM mining.mining_processes
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
          AND (phase ILIKE '%DISPONIB%' OR rodada IS NOT NULL)
        LIMIT 1
        """,
    )
    await _append_mining(
        "mining_processes",
        """
        SELECT id, process_number, phase, holder, substance, use_type, area_ha, uf, last_event, attrs,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM mining.mining_processes
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
        LIMIT 1
        """,
    )
    await _append_mining(
        "source_protection",
        """
        SELECT id, process_number, area_ha, attrs,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM mining.source_protection
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
        LIMIT 1
        """,
    )
    await _append_mining(
        "mining_blocks",
        """
        SELECT id, code, name, area_ha, uf, attrs,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM mining.mining_blocks
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
        LIMIT 1
        """,
    )
    await _append_mining(
        "placer_reserves",
        """
        SELECT id, code, name, area_ha, uf, attrs,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM mining.placer_reserves
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
        LIMIT 1
        """,
    )
    await _append_mining(
        "mining_leases",
        """
        SELECT id, code, name, area_ha, uf, attrs,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM mining.mining_leases
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
        LIMIT 1
        """,
    )

    if "lithology" in requested:
        q = text(
            """
            SELECT id, unit_name, rock_type, age, description, attrs,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM geo.lithology
            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
            LIMIT 1
            """
        )
        row = (await db.execute(q, {"lon": lon, "lat": lat})).mappings().first()
        if row:
            feature = enrich_lithology_feature(dict(row))
            results.append({"layer": "lithology", "feature": feature})

    if "springs" in requested:
        q = text(
            """
            SELECT id, name, stream_name, strahler_order, basin, source, attrs,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM hydro.springs
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography, 400)
            ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography)
            LIMIT 1
            """
        )
        row = (await db.execute(q, {"lon": lon, "lat": lat})).mappings().first()
        if row:
            results.append({"layer": "springs", "feature": dict(row)})

    if "secondary_streams" in requested:
        q = text(
            """
            SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM hydro.secondary_streams
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography, 5000)
            ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography)
            LIMIT 1
            """
        )
        row = (await db.execute(q, {"lon": lon, "lat": lat})).mappings().first()
        if row:
            results.append({"layer": "secondary_streams", "feature": dict(row)})

    requested_categories = [
        int(layer_id.split("_")[-1])
        for layer_id in requested
        if layer_id.startswith("stream_category_") and layer_id.split("_")[-1].isdigit()
    ]
    if requested_categories:
        q = text(
            """
            SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM hydro.rivers
            WHERE strahler_order = ANY(:orders)
              AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography, 5000)
            ORDER BY strahler_order DESC,
                     ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography)
            LIMIT 1
            """
        )
        row = (
            await db.execute(q, {"lon": lon, "lat": lat, "orders": requested_categories})
        ).mappings().first()
        if row:
            layer_key = f"stream_category_{row['strahler_order']}"
            results.append({"layer": layer_key, "feature": dict(row)})

    if "rivers" in requested:
        q = text(
            """
            SELECT id, name, strahler_order, basin, hydro_region, length_km, source, attrs,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM hydro.rivers
            WHERE strahler_order >= 5
              AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography, 8000)
            ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography)
            LIMIT 1
            """
        )
        row = (await db.execute(q, {"lon": lon, "lat": lat})).mappings().first()
        if row:
            results.append({"layer": "rivers", "feature": dict(row)})

    if "municipalities" in requested:
        q = text(
            """
            SELECT id, code, name, uf, state_name, attrs,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM admin.municipalities
            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
            LIMIT 1
            """
        )
        row = (await db.execute(q, {"lon": lon, "lat": lat})).mappings().first()
        if row:
            results.append({"layer": "municipalities", "feature": dict(row)})

    if "states" in requested:
        q = text(
            """
            SELECT id, code, uf, name, region, attrs,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM admin.states
            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
            LIMIT 1
            """
        )
        row = (await db.execute(q, {"lon": lon, "lat": lat})).mappings().first()
        if row:
            results.append({"layer": "states", "feature": dict(row)})

    if not results:
        return {"found": False, "message": "Nenhuma feição neste ponto."}

    primary = results[0]
    payload: dict = {"found": True, "results": results, **primary}
    if primary["layer"] == "lithology":
        payload["geology_summary"] = primary["feature"].get("geology_summary")
    if primary["layer"] in (
        "mining_processes", "mining_leilao_areas", "source_protection",
        "mining_blocks", "placer_reserves", "mining_leases",
    ):
        payload["mining_summary"] = primary["feature"].get("mining_summary")
    return payload

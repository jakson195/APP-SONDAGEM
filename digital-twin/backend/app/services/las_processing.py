"""Orquestração: LAS/LAZ → PDAL → 3D Tiles → terrain_models."""

from __future__ import annotations

import logging
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.database import SessionLocal
from app.models.geotech import TerrainModel
from app.services.pdal_las import PdalError, pdal_available, preprocess_las
from app.services.tiles3d_convert import Tiles3DError, las_to_3d_tiles, py3dtiles_available
from app.utils.geo import bbox_polygon

logger = logging.getLogger(__name__)


def tileset_public_url(project_id: UUID, terrain_id: UUID) -> str:
    return (
        f"{settings.api_v1_prefix}/tilesets/{project_id}/{terrain_id}/tileset.json"
    )


def tileset_dir(project_id: UUID, terrain_id: UUID) -> Path:
    return settings.upload_path / "tilesets" / str(project_id) / str(terrain_id)


def work_dir(terrain_id: UUID) -> Path:
    return settings.upload_path / "work" / str(terrain_id)


async def update_terrain_processing(
    db: AsyncSession,
    terrain_id: UUID,
    *,
    status: str,
    progress: int = 0,
    message: str = "",
    extra: dict[str, Any] | None = None,
) -> None:
    terrain = await db.scalar(
        select(TerrainModel).where(TerrainModel.id == terrain_id)
    )
    if terrain is None:
        return
    props = dict(terrain.properties or {})
    proc = dict(props.get("processing") or {})
    proc.update(
        {
            "status": status,
            "progress": progress,
            "message": message,
            "updated_at": datetime.now(UTC).isoformat(),
        }
    )
    if extra:
        proc.update(extra)
    props["processing"] = proc
    terrain.properties = props
    flag_modified(terrain, "properties")
    await db.commit()


def _run_pipeline_sync(
    input_path: Path,
    project_id: UUID,
    terrain_id: UUID,
) -> dict[str, Any]:
    wd = work_dir(terrain_id)
    processed = wd / "processed.laz"
    tiles_out = tileset_dir(project_id, terrain_id)

    if tiles_out.exists():
        shutil.rmtree(tiles_out)
    wd.mkdir(parents=True, exist_ok=True)

    if not pdal_available():
        raise PdalError("PDAL não encontrado no PATH")

    meta = preprocess_las(input_path, processed, wd)

    if not py3dtiles_available():
        raise Tiles3DError("py3dtiles não instalado")

    tileset_path = las_to_3d_tiles(processed, tiles_out)

    footprint = None
    bounds = meta.get("bounds")
    if bounds:
        footprint = bbox_polygon(
            bounds["minx"],
            bounds["miny"],
            bounds["maxx"],
            bounds["maxy"],
        )

    return {
        "tileset_path": str(tileset_path),
        "tileset_url": tileset_public_url(project_id, terrain_id),
        "point_count": meta.get("output_points") or meta.get("input_points"),
        "footprint": footprint,
    }


async def process_las_upload(
    terrain_id: UUID,
    project_id: UUID,
    input_path: Path,
) -> None:
    import asyncio

    async with SessionLocal() as db:
        await update_terrain_processing(
            db,
            terrain_id,
            status="processing",
            progress=10,
            message="A executar PDAL (reprojeção WGS84)…",
        )

    try:
        async with SessionLocal() as db:
            await update_terrain_processing(
                db,
                terrain_id,
                status="processing",
                progress=40,
                message="A converter para 3D Tiles (py3dtiles)…",
            )
        result = await asyncio.to_thread(
            _run_pipeline_sync, input_path, project_id, terrain_id
        )
    except (PdalError, Tiles3DError, OSError) as exc:
        logger.exception("LAS processing failed for %s", terrain_id)
        async with SessionLocal() as db:
            await update_terrain_processing(
                db,
                terrain_id,
                status="failed",
                progress=0,
                message=str(exc),
            )
        return

    async with SessionLocal() as db:
        terrain = await db.scalar(
            select(TerrainModel).where(TerrainModel.id == terrain_id)
        )
        if terrain is None:
            return

        props = dict(terrain.properties or {})
        props["processing"] = {
            "status": "completed",
            "progress": 100,
            "message": "Nuvem de pontos pronta",
            "tileset_url": result["tileset_url"],
            "point_count": result.get("point_count"),
            "completed_at": datetime.now(UTC).isoformat(),
        }
        props["tileset_url"] = result["tileset_url"]
        terrain.properties = props
        terrain.model_type = "point_cloud_3dtiles"
        terrain.source_uri = result["tileset_url"]
        if result.get("footprint") is not None:
            terrain.footprint = result["footprint"]
        flag_modified(terrain, "properties")
        await db.commit()

    logger.info("LAS→3D Tiles concluído: %s", terrain_id)

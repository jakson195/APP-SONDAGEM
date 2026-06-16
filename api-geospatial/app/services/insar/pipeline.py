"""Pipeline InSAR: S1 → processamento → GeoTIFF → persistência."""

from __future__ import annotations

import logging
import shutil
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.database import SessionLocal
from app.models.geotech import InsarImage, InsarProcessingJob, InsarRaster, InsarRasterKind, InsarJobStatus, Project
from app.services.insar.geotiff_export import GeoTiffProduct
from app.services.insar.insar_core import process_insar_stack
from app.services.insar.sentinel1 import (
    Sentinel1Scene,
    search_sentinel1_scenes,
    synthetic_sentinel1_scenes,
)
from app.utils.geo import bbox_polygon

logger = logging.getLogger(__name__)


def job_work_dir(project_id: UUID, job_id: UUID) -> Path:
    return settings.upload_path / "insar" / "jobs" / str(project_id) / str(job_id)


def raster_rel_path(project_id: UUID, job_id: UUID, filename: str) -> str:
    return f"insar/jobs/{project_id}/{job_id}/{filename}"


def raster_public_url(project_id: UUID, raster_id: UUID) -> str:
    return f"{settings.api_v1_prefix}/insar-rasters/{project_id}/{raster_id}.tif"


async def _set_job_status(
    db: AsyncSession,
    job_id: UUID,
    status: InsarJobStatus,
    *,
    progress: int | None = None,
    message: str = "",
    scene_count: int | None = None,
    error: str | None = None,
    extra: dict | None = None,
) -> None:
    job = await db.scalar(select(InsarProcessingJob).where(InsarProcessingJob.id == job_id))
    if job is None:
        return
    job.status = status
    if scene_count is not None:
        job.scene_count = scene_count
    if error is not None:
        job.error_message = error
    if status == InsarJobStatus.completed:
        job.completed_at = datetime.now(UTC)
    props = dict(job.properties or {})
    if progress is not None:
        props["progress"] = progress
    if message:
        props["message"] = message
    if extra:
        props.update(extra)
    job.properties = props
    flag_modified(job, "properties")
    await db.commit()


def _aoi_wkt_from_job(job: InsarProcessingJob) -> str:
    props = job.properties or {}
    if props.get("aoi_wkt"):
        return props["aoi_wkt"]
    raise ValueError("AOI WKT em falta no job")


async def _persist_raster(
    db: AsyncSession,
    *,
    job: InsarProcessingJob,
    product: GeoTiffProduct,
    kind: InsarRasterKind,
    epoch_date,
    insar_image_id: UUID | None,
    rel_name: str,
) -> InsarRaster:
    dest_dir = settings.upload_path / "insar" / "processed" / str(job.project_id) / str(job.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / rel_name
    if product.path != dest:
        shutil.copy2(product.path, dest)

    rel = raster_rel_path(job.project_id, job.id, rel_name)
    footprint = bbox_polygon(*product.bounds)
    raster = InsarRaster(
        project_id=job.project_id,
        job_id=job.id,
        insar_image_id=insar_image_id,
        raster_kind=kind,
        epoch_date=epoch_date,
        file_path=rel,
        file_size_bytes=dest.stat().st_size,
        crs_epsg=product.crs_epsg,
        pixel_size_m=product.pixel_size_m,
        width=product.width,
        height=product.height,
        nodata_value=product.nodata,
        min_value=product.min_value,
        max_value=product.max_value,
        mean_value=product.mean_value,
        units="mm" if kind == InsarRasterKind.displacement else "mm/yr" if kind == InsarRasterKind.velocity else "1",
        footprint=footprint,
        properties={"source_file": rel_name},
    )
    db.add(raster)
    await db.flush()
    await db.refresh(raster)
    props = dict(raster.properties or {})
    props["download_url"] = raster_public_url(job.project_id, raster.id)
    raster.properties = props
    flag_modified(raster, "properties")
    return raster


async def _register_scenes(
    db: AsyncSession,
    job: InsarProcessingJob,
    scenes: list[Sentinel1Scene],
) -> dict[str, UUID]:
    mapping: dict[str, UUID] = {}
    for scene in scenes:
        footprint = None
        if scene.footprint_wkt:
            footprint = WKTElement(scene.footprint_wkt, srid=4326)
        if footprint is None:
            footprint = job.aoi
        img = InsarImage(
            project_id=job.project_id,
            scene_id=scene.scene_id,
            satellite="Sentinel-1",
            orbit_direction=scene.orbit_direction,
            acquisition_date=scene.acquisition_date,
            processing_level="SLC",
            footprint=footprint,
            properties={
                "job_id": str(job.id),
                "product_name": scene.product_name,
                **scene.properties,
            },
        )
        db.add(img)
        await db.flush()
        mapping[scene.scene_id] = img.id
    return mapping


async def run_insar_job(job_id: UUID) -> None:
    import asyncio

    async with SessionLocal() as db:
        job = await db.scalar(
            select(InsarProcessingJob)
            .where(InsarProcessingJob.id == job_id)
        )
        if job is None:
            return
        project_id = job.project_id
        date_from = job.date_from
        date_to = job.date_to
        reference_date = job.reference_date
        orbit = job.orbit_direction
        try:
            aoi_wkt = _aoi_wkt_from_job(job)
        except ValueError as exc:
            await _set_job_status(
                db, job_id, InsarJobStatus.failed, error=str(exc)
            )
            return

    try:
        async with SessionLocal() as db:
            await _set_job_status(
                db, job_id, InsarJobStatus.fetching, progress=10, message="A obter Sentinel-1…"
            )

        scenes = await search_sentinel1_scenes(aoi_wkt, date_from, date_to, orbit)
        if not scenes:
            scenes = synthetic_sentinel1_scenes(aoi_wkt, date_from, date_to, orbit)

        async with SessionLocal() as db:
            await _set_job_status(
                db,
                job_id,
                InsarJobStatus.processing,
                progress=35,
                message="A processar interferogramas…",
                scene_count=len(scenes),
            )

        work = job_work_dir(project_id, job_id)
        result = await asyncio.to_thread(
            process_insar_stack, work, aoi_wkt, scenes, reference_date
        )

        async with SessionLocal() as db:
            await _set_job_status(
                db, job_id, InsarJobStatus.exporting, progress=75, message="A exportar GeoTIFF…"
            )
            job = await db.scalar(
                select(InsarProcessingJob).where(InsarProcessingJob.id == job_id)
            )
            if job is None:
                return
            scene_map = await _register_scenes(db, job, result.scenes_used)

            for epoch, prod in result.displacement_products:
                img_id = None
                for sc in result.scenes_used:
                    if sc.acquisition_date == epoch:
                        img_id = scene_map.get(sc.scene_id)
                        break
                await _persist_raster(
                    db,
                    job=job,
                    product=prod,
                    kind=InsarRasterKind.displacement,
                    epoch_date=epoch,
                    insar_image_id=img_id,
                    rel_name=f"displacement_{epoch.isoformat()}.tif",
                )

            await _persist_raster(
                db,
                job=job,
                product=result.velocity_product,
                kind=InsarRasterKind.velocity,
                epoch_date=None,
                insar_image_id=None,
                rel_name="velocity.tif",
            )
            if result.coherence_product:
                await _persist_raster(
                    db,
                    job=job,
                    product=result.coherence_product,
                    kind=InsarRasterKind.coherence,
                    epoch_date=None,
                    insar_image_id=None,
                    rel_name="coherence.tif",
                )

            await _set_job_status(
                db,
                job_id,
                InsarJobStatus.completed,
                progress=100,
                message=f"{len(result.displacement_products)} deslocamentos + velocidade exportados",
            )
            logger.info("Job InSAR %s concluído", job_id)

            from app.services.alerts.evaluator import evaluate_project_alerts

            try:
                await evaluate_project_alerts(db, job.project_id)
            except Exception:
                logger.exception(
                    "Avaliação de alertas falhou após job InSAR %s", job_id
                )

    except Exception as exc:
        logger.exception("Job InSAR %s falhou", job_id)
        async with SessionLocal() as db:
            await _set_job_status(
                db, job_id, InsarJobStatus.failed, error=str(exc), message="Falha no pipeline"
            )


async def aoi_wkt_for_project(db: AsyncSession, project_id: UUID, aoi_geojson: dict | None) -> str:
    if aoi_geojson:
        from shapely.geometry import shape

        geom = shape(aoi_geojson)
        if geom.geom_type == "MultiPolygon":
            geom = geom.convex_hull
        return geom.wkt
    project = await db.scalar(select(Project).where(Project.id == project_id))
    if project is None:
        raise ValueError("Projeto não encontrado")
    from sqlalchemy import func

    if project.boundary is not None:
        wkt = await db.scalar(select(func.ST_AsText(Project.boundary)).where(Project.id == project_id))
        if wkt:
            return wkt
    if project.center is not None:
        wkt = await db.scalar(select(func.ST_AsText(Project.center)).where(Project.id == project_id))
        if wkt:
            from shapely import wkt as sw

            pt = sw.loads(wkt)
            buf = pt.buffer(0.05)
            return buf.wkt
    # Demo AOI
    return "POLYGON((-48.0 -16.0, -47.5 -16.0, -47.5 -15.5, -48.0 -15.5, -48.0 -16.0))"

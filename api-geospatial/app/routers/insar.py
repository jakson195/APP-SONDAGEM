import json
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.geotech import InsarProcessingJob, InsarRaster, InsarRasterKind
from app.schemas.insar import (
    InsarJobCreate,
    InsarJobListResponse,
    InsarJobOut,
    InsarRasterListResponse,
    InsarRasterMetadata,
    InsarRasterOut,
)
from app.services.insar.pipeline import aoi_wkt_for_project, run_insar_job
from app.utils.deps import get_project_or_404
from app.utils.geo import geojson_to_wkt_element

router = APIRouter(prefix="/projects/{project_id}/insar", tags=["insar-processing"])


def _job_out(row, aoi_json: str | None) -> InsarJobOut:
    aoi = json.loads(aoi_json) if aoi_json else None
    return InsarJobOut(
        id=row.id,
        project_id=row.project_id,
        name=row.name,
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        date_from=row.date_from,
        date_to=row.date_to,
        reference_date=row.reference_date,
        orbit_direction=row.orbit_direction,
        scene_count=row.scene_count,
        error_message=row.error_message,
        properties=row.properties or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
        completed_at=row.completed_at,
        aoi=aoi,
    )


def _raster_urls(project_id: UUID, raster_id: UUID) -> tuple[str, str, str]:
    base = settings.public_api_url.rstrip("/")
    prefix = settings.api_v1_prefix
    download = f"{base}{prefix}/projects/{project_id}/insar/rasters/{raster_id}/download"
    meta = f"{base}{prefix}/projects/{project_id}/insar/rasters/{raster_id}"
    return download, meta


def _raster_out(row, footprint_json: str | None) -> InsarRasterOut:
    dl, preview, meta = _raster_urls(row.project_id, row.id)
    return InsarRasterOut(
        id=row.id,
        project_id=row.project_id,
        job_id=row.job_id,
        insar_image_id=row.insar_image_id,
        raster_kind=row.raster_kind.value if hasattr(row.raster_kind, "value") else str(row.raster_kind),
        epoch_date=row.epoch_date,
        file_path=row.file_path,
        download_url=dl,
        preview_url=preview,
        metadata_url=meta,
        crs_epsg=row.crs_epsg,
        pixel_size_m=row.pixel_size_m,
        width=row.width,
        height=row.height,
        units=row.units,
        min_value=row.min_value,
        max_value=row.max_value,
        mean_value=row.mean_value,
        footprint=json.loads(footprint_json) if footprint_json else None,
        properties=row.properties or {},
        created_at=row.created_at,
    )


@router.post("/jobs", response_model=InsarJobOut, status_code=202)
async def create_insar_job(
    project_id: UUID,
    body: InsarJobCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> InsarJobOut:
    if body.date_to < body.date_from:
        raise HTTPException(status_code=422, detail="date_to deve ser >= date_from")

    await get_project_or_404(db, project_id)
    aoi_wkt = await aoi_wkt_for_project(db, project_id, body.aoi_geojson)
    from shapely import wkt as sw

    aoi_geom = geojson_to_wkt_element(sw.loads(aoi_wkt))

    job = InsarProcessingJob(
        project_id=project_id,
        name=body.name,
        date_from=body.date_from,
        date_to=body.date_to,
        reference_date=body.reference_date or body.date_from,
        orbit_direction=body.orbit_direction.upper() if body.orbit_direction else None,
        aoi=aoi_geom,
        properties={"aoi_wkt": aoi_wkt, "progress": 0, "message": "Na fila"},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    if body.run_immediately:
        background_tasks.add_task(run_insar_job, job.id)

    gj = await db.scalar(
        select(func.ST_AsGeoJSON(InsarProcessingJob.aoi)).where(InsarProcessingJob.id == job.id)
    )
    return _job_out(job, gj)


@router.get("/jobs", response_model=InsarJobListResponse)
async def list_insar_jobs(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
) -> InsarJobListResponse:
    await get_project_or_404(db, project_id)
    limit = min(max(limit, 1), 200)
    total = await db.scalar(
        select(func.count(InsarProcessingJob.id)).where(
            InsarProcessingJob.project_id == project_id
        )
    )
    rows = (
        await db.execute(
            select(
                InsarProcessingJob,
                func.ST_AsGeoJSON(InsarProcessingJob.aoi).label("aoi_json"),
            )
            .where(InsarProcessingJob.project_id == project_id)
            .order_by(InsarProcessingJob.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
    ).all()
    items = [_job_out(r[0], r.aoi_json) for r in rows]
    return InsarJobListResponse(items=items, total=total or 0)


@router.get("/jobs/{job_id}", response_model=InsarJobOut)
async def get_insar_job(
    project_id: UUID,
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> InsarJobOut:
    await get_project_or_404(db, project_id)
    row = (
        await db.execute(
            select(
                InsarProcessingJob,
                func.ST_AsGeoJSON(InsarProcessingJob.aoi).label("aoi_json"),
            ).where(
                InsarProcessingJob.id == job_id,
                InsarProcessingJob.project_id == project_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Job InSAR não encontrado")
    return _job_out(row[0], row.aoi_json)


@router.post("/jobs/{job_id}/run", response_model=InsarJobOut)
async def run_job(
    project_id: UUID,
    job_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> InsarJobOut:
    await get_project_or_404(db, project_id)
    job = await db.scalar(
        select(InsarProcessingJob).where(
            InsarProcessingJob.id == job_id,
            InsarProcessingJob.project_id == project_id,
        )
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    background_tasks.add_task(run_insar_job, job_id)
    gj = await db.scalar(
        select(func.ST_AsGeoJSON(InsarProcessingJob.aoi)).where(InsarProcessingJob.id == job_id)
    )
    return _job_out(job, gj)


@router.get("/rasters", response_model=InsarRasterListResponse)
async def list_rasters(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    job_id: UUID | None = Query(None),
    kind: InsarRasterKind | None = Query(None),
    skip: int = 0,
    limit: int = 100,
) -> InsarRasterListResponse:
    await get_project_or_404(db, project_id)
    filters = [InsarRaster.project_id == project_id]
    if job_id:
        filters.append(InsarRaster.job_id == job_id)
    if kind:
        filters.append(InsarRaster.raster_kind == kind)

    total = await db.scalar(select(func.count(InsarRaster.id)).where(*filters))
    rows = (
        await db.execute(
            select(
                InsarRaster,
                func.ST_AsGeoJSON(InsarRaster.footprint).label("fp_json"),
            )
            .where(*filters)
            .order_by(InsarRaster.created_at.desc())
            .offset(skip)
            .limit(min(limit, 500))
        )
    ).all()
    return InsarRasterListResponse(
        items=[_raster_out(r[0], r.fp_json) for r in rows],
        total=total or 0,
    )


@router.get("/rasters/{raster_id}", response_model=InsarRasterMetadata)
async def raster_metadata(
    project_id: UUID,
    raster_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> InsarRasterMetadata:
    await get_project_or_404(db, project_id)
    row = (
        await db.execute(
            select(
                InsarRaster,
                func.ST_AsGeoJSON(InsarRaster.footprint).label("fp_json"),
            ).where(
                InsarRaster.id == raster_id,
                InsarRaster.project_id == project_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Raster não encontrado")
    r = row[0]
    dl, _, _ = _raster_urls(project_id, raster_id)
    return InsarRasterMetadata(
        id=r.id,
        raster_kind=r.raster_kind.value,
        epoch_date=r.epoch_date,
        crs_epsg=r.crs_epsg,
        pixel_size_m=r.pixel_size_m,
        width=r.width,
        height=r.height,
        units=r.units,
        nodata_value=r.nodata_value,
        min_value=r.min_value,
        max_value=r.max_value,
        mean_value=r.mean_value,
        footprint=json.loads(row.fp_json) if row.fp_json else None,
        download_url=dl,
        properties=r.properties or {},
    )


@router.get("/rasters/{raster_id}/preview.png")
async def raster_preview(
    project_id: UUID,
    raster_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    await get_project_or_404(db, project_id)
    raster = await db.scalar(
        select(InsarRaster).where(
            InsarRaster.id == raster_id,
            InsarRaster.project_id == project_id,
        )
    )
    if raster is None:
        raise HTTPException(status_code=404, detail="Raster não encontrado")
    tiff = settings.upload_path / raster.file_path
    if not tiff.is_file():
        raise HTTPException(status_code=404, detail="GeoTIFF não encontrado")
    preview = settings.upload_path / "insar" / "previews" / f"{raster_id}.png"
    if not preview.is_file():
        from app.services.insar.preview import geotiff_to_preview_png

        geotiff_to_preview_png(tiff, preview)
    return FileResponse(preview, media_type="image/png")


@router.get("/rasters/{raster_id}/download")
async def download_raster(
    project_id: UUID,
    raster_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    await get_project_or_404(db, project_id)
    raster = await db.scalar(
        select(InsarRaster).where(
            InsarRaster.id == raster_id,
            InsarRaster.project_id == project_id,
        )
    )
    if raster is None:
        raise HTTPException(status_code=404, detail="Raster não encontrado")
    path = settings.upload_path / raster.file_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Ficheiro GeoTIFF não encontrado no disco")
    filename = path.name
    return FileResponse(
        path,
        media_type="image/tiff",
        filename=filename,
        headers={"Cache-Control": "public, max-age=3600"},
    )

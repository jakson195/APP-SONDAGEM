import json
from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.geotech import InsarImage, TerrainModel
from app.schemas.las import LasProcessingStatus, LasStatusResponse, LasUploadResponse
from app.schemas.upload import InsarRasterUploadResponse, LidarUploadResponse
from app.services.displacement_import import bulk_insert_displacements, parse_displacement_file
from app.services.las_processing import process_las_upload
from app.services.pdal_las import pdal_available
from app.services.raster import footprint_from_geotiff
from app.services.storage import guess_lidar_type, is_las_file, save_upload
from app.services.tiles3d_convert import py3dtiles_available
from app.utils.deps import get_project_or_404
from app.utils.geo import geojson_to_wkt_element

router = APIRouter(prefix="/projects/{project_id}/uploads", tags=["uploads"])


def _processing_from_props(props: dict) -> LasProcessingStatus:
    proc = props.get("processing") or {}
    return LasProcessingStatus(
        status=proc.get("status", "unknown"),
        progress=int(proc.get("progress", 0)),
        message=proc.get("message", ""),
        tileset_url=proc.get("tileset_url") or props.get("tileset_url"),
        point_count=proc.get("point_count"),
        updated_at=proc.get("updated_at"),
        completed_at=proc.get("completed_at"),
    )


@router.post("/las", response_model=LasUploadResponse, status_code=202)
async def upload_las(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    acquisition_date: date | None = Form(None),
    db: AsyncSession = Depends(get_db),
) -> LasUploadResponse:
    """Upload LAS/LAZ — processamento PDAL + conversão 3D Tiles em background."""
    if not is_las_file(file.filename or ""):
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Use ficheiros .las ou .laz",
        )
    if not pdal_available():
        raise HTTPException(
            status_code=503,
            detail="PDAL não disponível no servidor",
        )
    if not py3dtiles_available():
        raise HTTPException(
            status_code=503,
            detail="py3dtiles não disponível no servidor",
        )

    await get_project_or_404(db, project_id)
    dest, stored = await save_upload(
        file,
        "las",
        project_id,
        max_mb=settings.las_max_upload_mb,
    )

    processing = {
        "status": "pending",
        "progress": 0,
        "message": "Na fila de processamento",
    }
    model = TerrainModel(
        project_id=project_id,
        name=name or file.filename or "Nuvem LAS",
        model_type="point_cloud_pending",
        source_uri=stored,
        acquisition_date=acquisition_date,
        properties={
            "processing": processing,
            "original_filename": file.filename,
            "raw_uri": stored,
        },
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)

    background_tasks.add_task(
        process_las_upload,
        model.id,
        project_id,
        dest,
    )

    return LasUploadResponse(
        terrain_model_id=model.id,
        project_id=project_id,
        name=model.name,
        original_filename=file.filename,
        processing=_processing_from_props(model.properties),
        created_at=model.created_at,
    )


@router.get("/las/{terrain_model_id}/status", response_model=LasStatusResponse)
async def get_las_status(
    project_id: UUID,
    terrain_model_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> LasStatusResponse:
    await get_project_or_404(db, project_id)
    model = await db.scalar(
        select(TerrainModel).where(
            TerrainModel.id == terrain_model_id,
            TerrainModel.project_id == project_id,
        )
    )
    if model is None:
        raise HTTPException(status_code=404, detail="Modelo não encontrado")

    fp_out = None
    if model.footprint is not None:
        gj = await db.scalar(
            select(func.ST_AsGeoJSON(TerrainModel.footprint)).where(
                TerrainModel.id == model.id
            )
        )
        fp_out = json.loads(gj) if gj else None

    props = model.properties or {}
    return LasStatusResponse(
        terrain_model_id=model.id,
        project_id=project_id,
        name=model.name,
        model_type=model.model_type,
        processing=_processing_from_props(props),
        tileset_url=props.get("tileset_url"),
        footprint=fp_out,
        properties=props,
    )


@router.post("/lidar", response_model=LidarUploadResponse, status_code=201)
async def upload_lidar(
    project_id: UUID,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    acquisition_date: date | None = Form(None),
    resolution_m: float | None = Form(None),
    vertical_datum: str | None = Form(None),
    footprint_geojson: str | None = Form(
        None, description="GeoJSON Polygon/MultiPolygon (WGS84) se não inferível do ficheiro"
    ),
    db: AsyncSession = Depends(get_db),
) -> LidarUploadResponse:
    await get_project_or_404(db, project_id)
    dest, stored = await save_upload(file, "lidar", project_id)
    footprint = None
    if footprint_geojson:
        footprint = geojson_to_wkt_element(footprint_geojson)
    else:
        fp = footprint_from_geotiff(str(dest))
        if fp:
            footprint = geojson_to_wkt_element(fp)

    model = TerrainModel(
        project_id=project_id,
        name=name or file.filename or "LiDAR",
        model_type=guess_lidar_type(file.filename or ""),
        source_uri=stored,
        acquisition_date=acquisition_date,
        resolution_m=resolution_m,
        vertical_datum=vertical_datum,
        footprint=footprint,
        properties={"original_filename": file.filename},
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)

    fp_out = None
    if model.footprint is not None:
        gj = await db.scalar(select(func.ST_AsGeoJSON(TerrainModel.footprint)).where(
            TerrainModel.id == model.id
        ))
        fp_out = json.loads(gj) if gj else None

    return LidarUploadResponse(
        terrain_model_id=model.id,
        project_id=project_id,
        name=model.name,
        source_uri=model.source_uri or stored,
        acquisition_date=model.acquisition_date,
        resolution_m=model.resolution_m,
        footprint=fp_out,
        created_at=model.created_at,
    )


@router.post("/insar-raster", response_model=InsarRasterUploadResponse, status_code=201)
async def upload_insar_raster(
    project_id: UUID,
    file: UploadFile = File(...),
    acquisition_date: date = Form(...),
    scene_id: str | None = Form(None),
    satellite: str | None = Form(None),
    orbit_direction: str | None = Form(None),
    processing_level: str | None = Form(None),
    footprint_geojson: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
) -> InsarRasterUploadResponse:
    await get_project_or_404(db, project_id)
    dest, stored = await save_upload(file, "insar", project_id)

    footprint = None
    if footprint_geojson:
        footprint = geojson_to_wkt_element(footprint_geojson)
    else:
        fp = footprint_from_geotiff(str(dest))
        if fp:
            footprint = geojson_to_wkt_element(fp)
    if footprint is None:
        raise HTTPException(
            status_code=422,
            detail="footprint_geojson obrigatório quando o raster não expõe extensão (instale rasterio ou envie polígono)",
        )

    image = InsarImage(
        project_id=project_id,
        scene_id=scene_id,
        satellite=satellite,
        orbit_direction=orbit_direction,
        acquisition_date=acquisition_date,
        processing_level=processing_level,
        footprint=footprint,
        properties={
            "source_uri": stored,
            "original_filename": file.filename,
            "content_type": file.content_type,
        },
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)

    fp_json = await db.scalar(
        select(func.ST_AsGeoJSON(InsarImage.footprint)).where(InsarImage.id == image.id)
    )
    fp_out = json.loads(fp_json) if fp_json else {}

    return InsarRasterUploadResponse(
        insar_image_id=image.id,
        project_id=project_id,
        source_uri=stored,
        acquisition_date=image.acquisition_date,
        footprint=fp_out,
        scene_id=image.scene_id,
        satellite=image.satellite,
        properties=image.properties,
        created_at=image.created_at,
    )


@router.post("/insar-displacements", status_code=201)
async def upload_insar_displacements(
    project_id: UUID,
    insar_image_id: UUID = Form(...),
    epoch_date: date | None = Form(None),
    file: UploadFile = File(..., description="CSV (lon,lat,displacement_mm) ou GeoJSON"),
    terrain_model_id: UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await get_project_or_404(db, project_id)

    image = await db.scalar(
        select(InsarImage).where(
            InsarImage.id == insar_image_id,
            InsarImage.project_id == project_id,
        )
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Cena InSAR não encontrada")

    content = await file.read()
    try:
        rows = parse_displacement_file(
            content, default_epoch=epoch_date or image.acquisition_date
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    if not rows:
        raise HTTPException(status_code=422, detail="Nenhum ponto válido no ficheiro")

    count = await bulk_insert_displacements(
        db,
        project_id=project_id,
        insar_image_id=insar_image_id,
        rows=rows,
        terrain_model_id=terrain_model_id,
    )
    from app.services.alerts.evaluator import evaluate_project_alerts

    alert_result = await evaluate_project_alerts(
        db, project_id, rebuild_areas=True, auto_commit=False
    )
    await db.commit()
    return {
        "imported": count,
        "insar_image_id": str(insar_image_id),
        "alerts": alert_result,
    }

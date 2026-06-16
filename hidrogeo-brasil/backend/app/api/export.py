"""Exportação GeoJSON / KML / Shapefile."""

from __future__ import annotations

import io
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
import simplekml
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

from app.core.config import settings

router = APIRouter()

LAYER_TABLES = {
    "rivers": ("public.rivers", "name"),
    "stream_category_1": ("public.stream_category_1", "name"),
    "stream_category_2": ("public.stream_category_2", "name"),
    "stream_category_3": ("public.stream_category_3", "name"),
    "stream_category_4": ("public.stream_category_4", "name"),
    "secondary_streams": ("hydro.secondary_streams", "name"),
    "springs": ("hydro.springs", "name"),
    "lithology": ("geo.lithology", "unit_name"),
    "water_bodies": ("hydro.water_bodies", "name"),
    "basins": ("hydro.basins", "name"),
    "states": ("admin.states", "name"),
    "municipalities": ("admin.municipalities", "name"),
    "mining_processes": ("mining.mining_processes", "process_number"),
    "source_protection": ("mining.source_protection", "process_number"),
    "mining_blocks": ("mining.mining_blocks", "name"),
    "placer_reserves": ("mining.placer_reserves", "name"),
    "mining_leases": ("mining.mining_leases", "name"),
}


class ExportRequest(BaseModel):
    layers: list[str] = Field(default_factory=lambda: ["rivers"])
    format: str = "geojson"  # geojson | kml | shp
    bbox: list[float] | None = None  # [minLon, minLat, maxLon, maxLat]
    polygon: list[list[float]] | None = None  # [[lon,lat], ...]


def _query_features(layers: list[str], bbox: list[float] | None, polygon: list[list[float]] | None):
    engine = create_engine(settings.database_url_sync)
    frames: dict[str, gpd.GeoDataFrame] = {}

    for layer in layers:
        if layer not in LAYER_TABLES:
            continue
        table, _ = LAYER_TABLES[layer]
        where = "TRUE"
        params: dict = {}
        if bbox and len(bbox) == 4:
            where = """
                ST_Intersects(geom, ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326))
            """
            params = {"minx": bbox[0], "miny": bbox[1], "maxx": bbox[2], "maxy": bbox[3]}
        elif polygon and len(polygon) >= 3:
            coords = ", ".join(f"{p[0]} {p[1]}" for p in polygon)
            if polygon[0] != polygon[-1]:
                coords += f", {polygon[0][0]} {polygon[0][1]}"
            where = f"ST_Intersects(geom, ST_GeomFromText('POLYGON(({coords}))', 4326))"
        sql = f"SELECT *, ST_AsEWKB(geom) AS ewkb FROM {table} WHERE {where}"
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()
        if not rows:
            continue
        from shapely import wkb

        geoms = [wkb.loads(bytes(r["ewkb"])) for r in rows]
        props = [{k: v for k, v in dict(r).items() if k not in ("ewkb", "geom")} for r in rows]
        frames[layer] = gpd.GeoDataFrame(props, geometry=geoms, crs="EPSG:4326")
    return frames


def _to_geojson(frames: dict[str, gpd.GeoDataFrame]) -> bytes:
    features = []
    for layer, gdf in frames.items():
        gdf = gdf.copy()
        gdf["layer"] = layer
        features.append(gdf)
    if not features:
        return b'{"type":"FeatureCollection","features":[]}'
    merged = gpd.GeoDataFrame(
        __import__("pandas").concat(features, ignore_index=True),
        crs="EPSG:4326",
    )
    return merged.to_json().encode("utf-8")


def _to_kml(frames: dict[str, gpd.GeoDataFrame]) -> bytes:
    kml = simplekml.Kml()
    for layer, gdf in frames.items():
        fol = kml.newfolder(name=layer)
        for _, row in gdf.iterrows():
            geom = row.geometry
            name = str(row.get("name") or row.get("unit_name") or layer)
            if geom.geom_type == "LineString":
                ls = fol.newlinestring(name=name)
                ls.coords = list(geom.coords)
            elif geom.geom_type == "MultiLineString":
                for part in geom.geoms:
                    ls = fol.newlinestring(name=name)
                    ls.coords = list(part.coords)
            elif geom.geom_type == "Polygon":
                pol = fol.newpolygon(name=name)
                pol.outerboundaryis = list(geom.exterior.coords)
            elif geom.geom_type == "MultiPolygon":
                for poly in geom.geoms:
                    pol = fol.newpolygon(name=name)
                    pol.outerboundaryis = list(poly.exterior.coords)
    return kml.kml().encode("utf-8")


def _to_shp_zip(frames: dict[str, gpd.GeoDataFrame]) -> bytes:
    buf = io.BytesIO()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for layer, gdf in frames.items():
                shp_dir = tmp_path / layer
                shp_dir.mkdir()
                shp_file = shp_dir / f"{layer}.shp"
                gdf.to_file(shp_file, driver="ESRI Shapefile")
                for f in shp_dir.iterdir():
                    zf.write(f, arcname=f"{layer}/{f.name}")
    buf.seek(0)
    return buf.read()


@router.post("")
async def export_selection(body: ExportRequest):
    frames = _query_features(body.layers, body.bbox, body.polygon)
    if not frames:
        raise HTTPException(404, "Nenhum elemento na área selecionada")

    fmt = body.format.lower()
    if fmt == "geojson":
        data = _to_geojson(frames)
        return Response(
            content=data,
            media_type="application/geo+json",
            headers={"Content-Disposition": "attachment; filename=hidrogeo-export.geojson"},
        )
    if fmt == "kml":
        data = _to_kml(frames)
        return Response(
            content=data,
            media_type="application/vnd.google-earth.kml+xml",
            headers={"Content-Disposition": "attachment; filename=hidrogeo-export.kml"},
        )
    if fmt == "shp":
        data = _to_shp_zip(frames)
        return StreamingResponse(
            io.BytesIO(data),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=hidrogeo-export.zip"},
        )
    raise HTTPException(400, "Formato inválido — use geojson, kml ou shp")


@router.post("/preview")
async def export_preview(body: ExportRequest):
    frames = _query_features(body.layers, body.bbox, body.polygon)
    counts = {k: len(v) for k, v in frames.items()}
    return {"layers": counts, "total": sum(counts.values())}

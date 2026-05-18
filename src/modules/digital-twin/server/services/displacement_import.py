"""Importação de pontos de deslocamento InSAR (CSV ou GeoJSON)."""

import csv
import io
import json
from datetime import date
from uuid import UUID

from geoalchemy2.elements import WKTElement
from shapely.geometry import shape
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geotech import InsarDisplacement


def _point_wkt(lon: float, lat: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def parse_displacement_file(
    content: bytes,
    *,
    default_epoch: date | None = None,
) -> list[dict]:
    text = content.decode("utf-8-sig").strip()
    if not text:
        return []

    if text.startswith("{") or text.startswith("["):
        return _parse_geojson(text, default_epoch)

    return _parse_csv(text, default_epoch)


def _parse_csv(text: str, default_epoch: date | None) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValueError("CSV vazio ou sem cabeçalho")

    fields = {f.lower().strip(): f for f in reader.fieldnames}
    lon_key = fields.get("lon") or fields.get("longitude") or fields.get("x")
    lat_key = fields.get("lat") or fields.get("latitude") or fields.get("y")
    disp_key = (
        fields.get("displacement_mm")
        or fields.get("displacement")
        or fields.get("disp_mm")
    )
    if not lon_key or not lat_key or not disp_key:
        raise ValueError(
            "CSV deve ter colunas lon/lat e displacement_mm (ou equivalentes)"
        )

    epoch_key = fields.get("epoch_date") or fields.get("date")
    rows: list[dict] = []
    for line in reader:
        lon = float(line[lon_key])
        lat = float(line[lat_key])
        disp = float(line[disp_key])
        epoch = default_epoch
        if epoch_key and line.get(epoch_key):
            epoch = date.fromisoformat(line[epoch_key][:10])
        if epoch is None:
            raise ValueError("epoch_date obrigatório (coluna ou parâmetro)")
        row: dict = {
            "epoch_date": epoch,
            "displacement_mm": disp,
            "geom": _point_wkt(lon, lat),
        }
        for opt, keys in (
            ("velocity_mm_yr", ("velocity_mm_yr", "velocity")),
            ("coherence", ("coherence",)),
            ("los_azimuth_deg", ("los_azimuth_deg",)),
            ("los_incidence_deg", ("los_incidence_deg",)),
        ):
            k = next((fields.get(x) for x in keys if fields.get(x)), None)
            if k and line.get(k) not in (None, ""):
                row[opt] = float(line[k])
        rows.append(row)
    return rows


def _parse_geojson(text: str, default_epoch: date | None) -> list[dict]:
    data = json.loads(text)
    features = data.get("features", [data]) if data.get("type") == "FeatureCollection" else [data]
    rows: list[dict] = []
    for feat in features:
        if feat.get("type") != "Feature":
            continue
        geom = shape(feat["geometry"])
        props = feat.get("properties") or {}
        disp = props.get("displacement_mm") or props.get("displacement")
        if disp is None:
            raise ValueError("GeoJSON: properties.displacement_mm obrigatório")
        epoch_s = props.get("epoch_date") or props.get("date")
        epoch = date.fromisoformat(str(epoch_s)[:10]) if epoch_s else default_epoch
        if epoch is None:
            raise ValueError("epoch_date obrigatório em properties ou parâmetro")
        rows.append(
            {
                "epoch_date": epoch,
                "displacement_mm": float(disp),
                "geom": WKTElement(geom.wkt, srid=4326),
                "velocity_mm_yr": props.get("velocity_mm_yr"),
                "coherence": props.get("coherence"),
            }
        )
    return rows


async def bulk_insert_displacements(
    session: AsyncSession,
    *,
    project_id: UUID,
    insar_image_id: UUID,
    rows: list[dict],
    terrain_model_id: UUID | None = None,
) -> int:
    for row in rows:
        session.add(
            InsarDisplacement(
                project_id=project_id,
                insar_image_id=insar_image_id,
                terrain_model_id=terrain_model_id,
                epoch_date=row["epoch_date"],
                displacement_mm=row["displacement_mm"],
                velocity_mm_yr=row.get("velocity_mm_yr"),
                coherence=row.get("coherence"),
                los_azimuth_deg=row.get("los_azimuth_deg"),
                los_incidence_deg=row.get("los_incidence_deg"),
                geom=row["geom"],
                properties=row.get("properties") or {},
            )
        )
    await session.flush()
    return len(rows)

import json
from typing import Any

from geoalchemy2.elements import WKTElement
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy import func, select


def geojson_to_wkt_element(geojson: str | dict[str, Any], srid: int = 4326) -> WKTElement:
    data = json.loads(geojson) if isinstance(geojson, str) else geojson
    geom = shape(data)
    return shapely_to_wkt_element(geom, srid)


def shapely_to_wkt_element(geom: BaseGeometry, srid: int = 4326) -> WKTElement:
    return WKTElement(geom.wkt, srid=srid)


async def row_geom_to_geojson(session, geom) -> dict[str, Any] | None:
    if geom is None:
        return None
    result = await session.scalar(select(func.ST_AsGeoJSON(geom)))
    return json.loads(result) if result else None


def bbox_polygon(minx: float, miny: float, maxx: float, maxy: float, srid: int = 4326):
    from shapely.geometry import box

    return shapely_to_wkt_element(box(minx, miny, maxx, maxy), srid)

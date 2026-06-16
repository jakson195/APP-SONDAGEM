"""Optional GeoTIFF footprint extraction (rasterio if installed)."""

from typing import Any


def footprint_from_geotiff(path: str) -> dict[str, Any] | None:
    try:
        import rasterio
        from rasterio.warp import transform_bounds
        from shapely.geometry import box, mapping
    except ImportError:
        return None

    with rasterio.open(path) as ds:
        bounds = ds.bounds
        if ds.crs and ds.crs.to_epsg() and ds.crs.to_epsg() != 4326:
            west, south, east, north = transform_bounds(
                ds.crs, "EPSG:4326", *bounds
            )
        else:
            west, south, east, north = bounds
        return mapping(box(west, south, east, north))

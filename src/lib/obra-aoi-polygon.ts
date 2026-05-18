import type { Polygon } from "geojson";

import { geoJsonPolygonToWkt } from "@/lib/geojson-polygon-wkt";

/** Valida e devolve `Polygon` GeoJSON ou `null`. */
export function parsePolygonBody(input: unknown): Polygon | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Polygon;
  if (o.type !== "Polygon") return null;
  return geoJsonPolygonToWkt(o) ? o : null;
}

/** Centro médio do anel exterior WGS84 `[lng, lat]`. */
export function polygonCentroidLngLat(polygon: Polygon): {
  lng: number;
  lat: number;
} {
  const outer = polygon.coordinates[0] as [number, number][] | undefined;
  if (!outer?.length) return { lng: 0, lat: 0 };
  const ring =
    outer.length > 1 &&
    outer[0]![0] === outer[outer.length - 1]![0] &&
    outer[0]![1] === outer[outer.length - 1]![1]
      ? outer.slice(0, -1)
      : outer;
  let sx = 0;
  let sy = 0;
  for (const [lng, lat] of ring) {
    sx += lng;
    sy += lat;
  }
  const n = ring.length;
  return n ? { lng: sx / n, lat: sy / n } : { lng: 0, lat: 0 };
}

import type { Polygon } from "geojson";

import { geoJsonPolygonToWkt } from "@/lib/geojson-polygon-wkt";

/** `[latitude, longitude]` para Leaflet */
export type LeafletLatLng = [number, number];

/** GeoJSON Polygon → vértices Leaflet (anel exterior, sem ponto de fecho duplicado). */
export function polygonToLeafletVertices(polygon: Polygon): LeafletLatLng[] {
  const outer = polygon.coordinates[0] as [number, number][] | undefined;
  if (!outer?.length) return [];
  const ring =
    outer.length > 1 &&
    outer[0]![0] === outer[outer.length - 1]![0] &&
    outer[0]![1] === outer[outer.length - 1]![1]
      ? outer.slice(0, -1)
      : outer;
  return ring.map(([lng, lat]) => [lat, lng] as LeafletLatLng);
}

export function leafletVerticesToPolygon(
  vertices: LeafletLatLng[],
): Polygon | null {
  if (vertices.length < 3) return null;
  const outer = vertices.map(([lat, lng]) => [lng, lat] as [number, number]);
  const first = outer[0]!;
  const last = outer[outer.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    outer.push([first[0], first[1]]);
  }
  const poly: Polygon = { type: "Polygon", coordinates: [outer] };
  return geoJsonPolygonToWkt(poly) ? poly : null;
}

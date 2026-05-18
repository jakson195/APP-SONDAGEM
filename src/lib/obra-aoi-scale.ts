import type { Polygon } from "geojson";

import { polygonCentroidLngLat } from "@/lib/obra-aoi-polygon";

/** Escala o polígono em torno do centroide (`factor` 1 = igual, 1.2 = +20%). */
export function scalePolygonAroundCentroid(
  polygon: Polygon,
  factor: number,
): Polygon {
  if (!Number.isFinite(factor) || factor <= 0) return polygon;
  const { lng: cx, lat: cy } = polygonCentroidLngLat(polygon);
  const outer = polygon.coordinates[0] as [number, number][] | undefined;
  if (!outer?.length) return polygon;

  const scaled = outer.map(([lng, lat]) => [
    cx + (lng - cx) * factor,
    cy + (lat - cy) * factor,
  ] as [number, number]);

  const first = scaled[0]!;
  const last = scaled[scaled.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    scaled.push([first[0], first[1]]);
  }

  return { type: "Polygon", coordinates: [scaled] };
}

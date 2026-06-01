/**
 * Geometria planimétrica de linhas ERT em coordenadas locais (metros).
 */

import { latLngToLocalM, localMToLatLng, type XY } from "@/lib/hydraulic-interpolation";
import { endpointToWgs84, geometryStartEndWgs84 } from "./geometry-coords";
import type { SurveyLineGeometry } from "./volume3d-types";

export type LineSegmentLocal = {
  id: string;
  name: string;
  start: XY;
  end: XY;
  lengthM: number;
  azimuthRad: number;
};

/** Converte linha WGS84 → segmento em metros relativos ao anchor. */
export function lineToLocalSegment(
  id: string,
  name: string,
  geometry: SurveyLineGeometry,
  anchorLat: number,
  anchorLng: number,
): LineSegmentLocal {
  const { start: s, end: e } = geometryStartEndWgs84(geometry);
  const start = latLngToLocalM(anchorLat, anchorLng, s.lat, s.lng);
  const end = latLngToLocalM(anchorLat, anchorLng, e.lat, e.lng);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthM = Math.hypot(dx, dy);
  const azimuthRad = Math.atan2(dx, dy);
  return { id, name, start, end, lengthM: Math.max(lengthM, 1), azimuthRad };
}

/** Projeção de ponto (x,y) sobre segmento A→B. */
export function projectPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { alongM: number; perpDistM: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) {
    const d = Math.hypot(px - ax, py - ay);
    return { alongM: 0, perpDistM: d, t: 0 };
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  const alongM = t * Math.sqrt(len2);
  const perpDistM = Math.hypot(px - qx, py - qy);
  return { alongM, perpDistM, t };
}

/** Bounds planimétricos de várias linhas + padding. */
export function boundsFromLineSegments(
  segments: LineSegmentLocal[],
  padM: number,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (segments.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of segments) {
    for (const p of [s.start, s.end]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  return {
    minX: minX - padM,
    maxX: maxX + padM,
    minY: minY - padM,
    maxY: maxY + padM,
  };
}

/** Azimute em graus (0=N, 90=E) a partir de dois pontos WGS84. */
export function azimuthDegFromEndpoints(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
): number {
  const dLng = ((end.lng - start.lng) * Math.PI) / 180;
  const lat1 = (start.lat * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

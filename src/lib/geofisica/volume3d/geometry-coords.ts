import { latLngToLocalM, localMToLatLng } from "@/lib/hydraulic-interpolation";
import type {
  GeophysSurveyLine,
  GeorefCoordMode,
  SectionPoint3D,
  SurveyLineGeometry,
} from "./volume3d-types";

/** wgs84: x=lat(°), y=lng(°), z=cota(m). project: x=E(m), y=N(m), z=cota(m). */
export function wgs84Endpoint(p: SectionPoint3D): { lat: number; lng: number; zM: number } {
  return { lat: p.x, lng: p.y, zM: p.z };
}

export function endpointToWgs84(
  p: SectionPoint3D,
  geometry: SurveyLineGeometry,
): { lat: number; lng: number; zM: number } {
  if (geometry.coordMode === "wgs84") {
    return wgs84Endpoint(p);
  }
  const o = geometry.projectOrigin;
  if (!o) return wgs84Endpoint(p);
  const ll = localMToLatLng(o.x, o.y, { x: p.x, y: p.y });
  return { lat: ll.lat, lng: ll.lng, zM: p.z };
}

export function geometryStartEndWgs84(geometry: SurveyLineGeometry): {
  start: { lat: number; lng: number; zM: number };
  end: { lat: number; lng: number; zM: number };
} {
  return {
    start: endpointToWgs84(geometry.start, geometry),
    end: endpointToWgs84(geometry.end, geometry),
  };
}

export function wgs84ToGeometryPoint(
  lat: number,
  lng: number,
  zM: number,
  mode: GeorefCoordMode,
  projectOrigin?: SectionPoint3D,
): SectionPoint3D {
  if (mode === "wgs84") {
    return { x: lat, y: lng, z: zM };
  }
  if (!projectOrigin) {
    return { x: 0, y: 0, z: zM };
  }
  const local = latLngToLocalM(projectOrigin.x, projectOrigin.y, lat, lng);
  return { x: local.x, y: local.y, z: zM };
}

export function formatEndpointLabel(
  p: SectionPoint3D,
  mode: GeorefCoordMode,
): string {
  if (mode === "wgs84") {
    return `${p.x.toFixed(6)}°, ${p.y.toFixed(6)}°, Z=${p.z.toFixed(1)} m`;
  }
  return `E ${p.x.toFixed(1)} m, N ${p.y.toFixed(1)} m, Z=${p.z.toFixed(1)} m`;
}

export function computeSurveyAnchor(lines: GeophysSurveyLine[]): {
  lat: number;
  lng: number;
} {
  if (lines.length === 0) {
    return { lat: 0, lng: 0 };
  }
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const line of lines) {
    const { start, end } = geometryStartEndWgs84(line.geometry);
    lat += start.lat + end.lat;
    lng += start.lng + end.lng;
    n += 2;
  }
  return { lat: lat / n, lng: lng / n };
}

export function parseCoordTriple(
  text: string,
  mode: GeorefCoordMode,
): SectionPoint3D | null {
  const parts = text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const x = Number(parts[0]!.replace(",", "."));
  const y = Number(parts[1]!.replace(",", "."));
  const z = parts[2] != null ? Number(parts[2].replace(",", ".")) : 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, z: Number.isFinite(z) ? z : 0 };
}

/** Migra geometria legada { start: { lat, lng } } se necessário. */
export function normalizeSurveyLineGeometry(
  g: SurveyLineGeometry & {
    start?: { lat?: number; lng?: number; zM?: number; x?: number; y?: number; z?: number };
    end?: { lat?: number; lng?: number; zM?: number; x?: number; y?: number; z?: number };
  },
): SurveyLineGeometry {
  const start = g.start as SectionPoint3D & { lat?: number; lng?: number; zM?: number };
  const end = g.end as SectionPoint3D & { lat?: number; lng?: number; zM?: number };
  if (start.lat != null && start.lng != null && start.x == null) {
    return {
      ...g,
      coordMode: g.coordMode ?? "wgs84",
      start: { x: start.lat, y: start.lng, z: start.zM ?? start.z ?? 0 },
      end: { x: end.lat!, y: end.lng!, z: end.zM ?? end.z ?? 0 },
    };
  }
  return {
    coordMode: g.coordMode ?? "wgs84",
    start: g.start,
    end: g.end,
    projectOrigin: g.projectOrigin,
    azimuthDeg: g.azimuthDeg,
    spacingM: g.spacingM,
  };
}

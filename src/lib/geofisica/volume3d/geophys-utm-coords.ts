import {
  labelFusoUtm,
  parseFusoUtm,
  parseNumeroCoord,
} from "@/lib/coordenadas-utm-campo";
import { latLonToUtm, utmToLatLonHemisphere } from "@/lib/utm";

export type UtmMeters = {
  easting: number;
  northing: number;
  fuso: string;
};

/** WGS84 → UTM (metros, numérico). */
export function wgs84ToUtmMeters(
  lat: number,
  lng: number,
  fusoPreferido?: string,
): UtmMeters | null {
  const fp = fusoPreferido?.trim() ? parseFusoUtm(fusoPreferido) : null;
  const utm = latLonToUtm(lat, lng, fp?.zoneNum);
  if (!utm) return null;
  const southern = utm.zoneLetter ? utm.zoneLetter < "N" : lat < 0;
  return {
    easting: utm.easting,
    northing: utm.northing,
    fuso: labelFusoUtm(utm.zoneNum, southern),
  };
}

/** UTM (N/E metros + fuso) → WGS84. */
export function utmMetersToWgs84(
  northing: number,
  easting: number,
  fuso: string,
): { lat: number; lng: number } | null {
  const f = parseFusoUtm(fuso);
  if (!f) return null;
  const pt = utmToLatLonHemisphere(
    easting,
    northing,
    f.zoneNum,
    !f.southern,
    false,
  );
  return pt ? { lat: pt.latitude, lng: pt.longitude } : null;
}

/** Colar «N, E, Z» ou «E, N, Z» — assume N,E se northing > 1e6. */
export function parseUtmPaste(
  text: string,
  fuso: string,
): { northing: number; easting: number; z: number } | null {
  const parts = text
    .split(/[,;\s]+/)
    .map((s) => parseNumeroCoord(s))
    .filter((n): n is number => n != null);
  if (parts.length < 2) return null;
  let northing: number;
  let easting: number;
  if (parts[0]! > 1_000_000 && parts[1]! < 1_000_000) {
    northing = parts[0]!;
    easting = parts[1]!;
  } else if (parts[1]! > 1_000_000 && parts[0]! < 1_000_000) {
    easting = parts[0]!;
    northing = parts[1]!;
  } else {
    northing = parts[0]!;
    easting = parts[1]!;
  }
  const z = parts[2] ?? 0;
  return { northing, easting, z: Number.isFinite(z) ? z : 0 };
}

export type CoordInputMode = "wgs84" | "utm";

export function defaultUtmFusoBrasil(): string {
  return "22S";
}

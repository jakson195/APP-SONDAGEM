/**
 * Importação de ficheiros XYZ (coordenadas + propriedade geofísica).
 * Suporta: X Y Z Rho | Easting Northing Elevation Resistivity | lon lat elev value
 */

import type { Dipolo2DReading } from "../dipolo2d/types";
import type { TopographyPoint } from "../dipolo2d/topography-types";
import type { SurveyLineGeometry } from "./volume3d-types";
import { azimuthDegFromEndpoints } from "./line-geometry-3d";

export type XyzPoint = {
  x: number;
  y: number;
  z: number;
  value: number;
  /** Coordenada ao longo do perfil (m) — inferida se colinear. */
  stationM?: number;
};

export type XyzParseResult = {
  points: XyzPoint[];
  /** Se pontos têm lat/lng WGS84. */
  isGeographic: boolean;
  /** Propriedade (log10 ou linear — detectado). */
  valueIsLog10: boolean;
  warnings: string[];
  title?: string;
};

function parseNum(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const X_KEYS = new Set(["x", "easting", "east", "lon", "longitude", "lng"]);
const Y_KEYS = new Set(["y", "northing", "north", "lat", "latitude"]);
const Z_KEYS = new Set(["z", "elev", "elevation", "cota", "altitude", "depth"]);
const V_KEYS = new Set([
  "rho",
  "rhoa",
  "resistivity",
  "value",
  "v",
  "rap",
  "logrho",
  "log10rho",
]);

function detectColumns(headers: string[]): {
  xi: number;
  yi: number;
  zi: number;
  vi: number;
  isGeo: boolean;
} | null {
  const norm = headers.map(normalizeHeader);
  let xi = -1;
  let yi = -1;
  let zi = -1;
  let vi = -1;
  let isGeo = false;

  for (let i = 0; i < norm.length; i++) {
    const h = norm[i]!;
    if (X_KEYS.has(h) && xi < 0) {
      xi = i;
      if (h === "lon" || h === "longitude" || h === "lng") isGeo = true;
    }
    if (Y_KEYS.has(h) && yi < 0) {
      yi = i;
      if (h === "lat" || h === "latitude") isGeo = true;
    }
    if (Z_KEYS.has(h) && zi < 0) zi = i;
    if (V_KEYS.has(h) && vi < 0) vi = i;
  }

  if (xi >= 0 && yi >= 0 && vi >= 0) {
    return { xi, yi, zi: zi >= 0 ? zi : -1, vi, isGeo };
  }
  return null;
}

/** XYZ sem cabeçalho: col0=x, col1=y, col2=z|value, col3=value. */
function parseNumericRows(lines: string[]): XyzPoint[] {
  const pts: XyzPoint[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/[\s,;]+/).filter(Boolean);
    if (parts.length < 3) continue;
    const nums = parts.map(parseNum);
    if (nums.some((n) => n == null)) continue;
    if (parts.length >= 4) {
      pts.push({
        x: nums[0]!,
        y: nums[1]!,
        z: nums[2]!,
        value: nums[3]!,
      });
    } else {
      pts.push({
        x: nums[0]!,
        y: nums[1]!,
        z: 0,
        value: nums[2]!,
      });
    }
  }
  return pts;
}

export function parseXyzFile(text: string, fileName?: string): XyzParseResult | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const warnings: string[] = [];
  const firstParts = lines[0]!.split(/[\s,;\t]+/);
  const maybeHeader = firstParts.some((p) => /[a-zA-Z]/.test(p));

  let points: XyzPoint[] = [];
  let isGeographic = false;

  if (maybeHeader) {
    const cols = detectColumns(firstParts);
    if (!cols) return null;
    isGeographic = cols.isGeo;
    for (let li = 1; li < lines.length; li++) {
      const parts = lines[li]!.split(/[\s,;\t]+/);
      const x = parseNum(parts[cols.xi] ?? "");
      const y = parseNum(parts[cols.yi] ?? "");
      const v = parseNum(parts[cols.vi] ?? "");
      if (x == null || y == null || v == null) continue;
      const z = cols.zi >= 0 ? parseNum(parts[cols.zi] ?? "") ?? 0 : 0;
      points.push({ x, y, z, value: v });
    }
  } else {
    points = parseNumericRows(lines);
    isGeographic =
      points.length > 0 &&
      Math.abs(points[0]!.x) <= 180 &&
      Math.abs(points[0]!.y) <= 90;
  }

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  const valueIsLog10 = maxV < 6 && minV > -2;

  inferStationsAlongProfile(points);

  return {
    points,
    isGeographic,
    valueIsLog10,
    warnings,
    title: fileName?.replace(/\.[^.]+$/, ""),
  };
}

/** Atribui stationM por distância acumulada ao longo do eixo principal. */
function inferStationsAlongProfile(points: XyzPoint[]): void {
  if (points.length < 2) return;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const projected = points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return dx * cos + dy * sin;
  });
  const minP = Math.min(...projected);
  for (let i = 0; i < points.length; i++) {
    points[i]!.stationM = projected[i]! - minP;
  }
}

/** Converte XYZ colinear em leituras dipolo-like (ρa aparente por estação). */
export function xyzToDipoloReadings(
  parsed: XyzParseResult,
  defaultAM = 15,
): Dipolo2DReading[] {
  const byStation = new Map<number, XyzPoint[]>();
  for (const p of parsed.points) {
    const st = Math.round((p.stationM ?? 0) * 10) / 10;
    const arr = byStation.get(st) ?? [];
    arr.push(p);
    byStation.set(st, arr);
  }

  const readings: Dipolo2DReading[] = [];
  for (const [stationM, pts] of byStation) {
    pts.sort((a, b) => a.z - b.z);
    const rho = pts[0]!.value;
    const rhoLin = parsed.valueIsLog10 ? 10 ** rho : rho;
    if (!(rhoLin > 0)) continue;
    readings.push({
      stationM,
      n: 1,
      rhoApparentOhmM: rhoLin,
      aM: defaultAM,
    });
  }
  readings.sort((a, b) => a.stationM - b.stationM);
  return readings;
}

/** Infere geometria WGS84 ou UTM-like → lat/lng se geográfico. */
export function xyzToLineGeometry(parsed: XyzParseResult): SurveyLineGeometry | null {
  if (parsed.points.length < 2) return null;

  const sorted = [...parsed.points].sort(
    (a, b) => (a.stationM ?? 0) - (b.stationM ?? 0),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (parsed.isGeographic) {
    const start = { lat: first.y, lng: first.x };
    const end = { lat: last.y, lng: last.x };
    return {
      start,
      end,
      azimuthDeg: azimuthDegFromEndpoints(start, end),
      spacingM: inferSpacing(sorted),
    };
  }

  warningsLocalMetric(parsed, first, last);
  return null;
}

function inferSpacing(points: XyzPoint[]): number | undefined {
  if (points.length < 2) return undefined;
  let span = 0;
  for (let i = 1; i < points.length; i++) {
    span += Math.abs((points[i]!.stationM ?? 0) - (points[i - 1]!.stationM ?? 0));
  }
  return span / (points.length - 1);
}

function warningsLocalMetric(
  _parsed: XyzParseResult,
  _first: XyzPoint,
  _last: XyzPoint,
): void {
  /* Coordenadas métricas locais — geometria definida pelo auto-cadastro de linhas paralelas. */
}

export function xyzToTopography(parsed: XyzParseResult): TopographyPoint[] {
  const byStation = new Map<number, number>();
  for (const p of parsed.points) {
    const st = p.stationM ?? 0;
    if (!byStation.has(st) || p.z > byStation.get(st)!) {
      byStation.set(st, p.z);
    }
  }
  return [...byStation.entries()]
    .map(([stationM, elevationM]) => ({ stationM, elevationM }))
    .sort((a, b) => a.stationM - b.stationM);
}

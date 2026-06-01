import type { TopographyPoint } from "./topography-types";

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

const STATION_KEYS = new Set([
  "dist",
  "distance",
  "station",
  "stationm",
  "x",
  "m",
  "abscissa",
  "estacao",
  "piquete",
]);

const ELEV_KEYS = new Set([
  "elev",
  "elevation",
  "elevacao",
  "cota",
  "z",
  "altitude",
  "alt",
  "height",
  "nivelterreno",
  "topo",
]);

function dedupeSort(points: TopographyPoint[]): TopographyPoint[] {
  const byX = new Map<number, TopographyPoint>();
  for (const p of points) {
    if (!(p.stationM >= 0 && Number.isFinite(p.elevationM))) continue;
    byX.set(Math.round(p.stationM * 1000) / 1000, p);
  }
  return [...byX.values()].sort((a, b) => a.stationM - b.stationM);
}

/** CSV/TSV: colunas distância + cota (nomes flexíveis). */
export function parseTopographyDelimited(text: string): TopographyPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const sep = lines[0]!.includes("\t") ? "\t" : lines[0]!.includes(";") ? ";" : ",";
  const header = lines[0]!.split(sep).map(normalizeHeader);
  let iStation = header.findIndex((h) => STATION_KEYS.has(h));
  let iElev = header.findIndex((h) => ELEV_KEYS.has(h));

  let startRow = 1;
  if (iStation < 0 || iElev < 0) {
    const nums = lines[0]!.split(sep).map(parseNum);
    if (nums.length >= 2 && nums[0] != null && nums[1] != null) {
      iStation = 0;
      iElev = 1;
      startRow = 0;
    } else {
      return [];
    }
  }

  const out: TopographyPoint[] = [];
  for (let i = startRow; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim());
    const st = parseNum(cols[iStation] ?? "");
    const el = parseNum(cols[iElev] ?? "");
    if (st == null || el == null) continue;
    out.push({ stationM: st, elevationM: el });
  }
  return dedupeSort(out);
}

/** Colar duas colunas (distância + cota), separadas por tab/espaço/vírgula. */
export function parseTopographyPaste(text: string): TopographyPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: TopographyPoint[] = [];
  for (const line of lines) {
    const parts = line.split(/[\t,;]+/).map((p) => p.trim());
    if (parts.length < 2) continue;
    const st = parseNum(parts[0]!);
    const el = parseNum(parts[1]!);
    if (st == null || el == null) continue;
    out.push({ stationM: st, elevationM: el });
  }
  return dedupeSort(out);
}

/** Estações únicas das leituras ρa (cota vazia para preenchimento manual). */
export function topographyStationsFromDistances(
  stationsM: number[],
): TopographyPoint[] {
  const uniq = [...new Set(stationsM.filter((s) => Number.isFinite(s)))].sort(
    (a, b) => a - b,
  );
  return uniq.map((stationM) => ({ stationM, elevationM: 0 }));
}

/** Topografia de demonstração ao longo das estações do perfil. */
export function buildDemoTopography(stationsM: number[]): TopographyPoint[] {
  const uniq = [...new Set(stationsM.filter((s) => Number.isFinite(s)))].sort(
    (a, b) => a - b,
  );
  if (uniq.length < 2) return [];
  const x0 = uniq[0]!;
  const x1 = uniq[uniq.length - 1]!;
  const span = Math.max(1, x1 - x0);
  return uniq.map((stationM, i) => ({
    stationM,
    elevationM:
      128 -
      ((stationM - x0) / span) * 18 +
      Math.sin((i / Math.max(1, uniq.length - 1)) * Math.PI * 1.4) * 4,
  }));
}

export function interpolateTopographyAt(
  points: TopographyPoint[],
  stationM: number,
): number | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0]!.elevationM;
  const sorted = [...points].sort((a, b) => a.stationM - b.stationM);
  if (stationM <= sorted[0]!.stationM) return sorted[0]!.elevationM;
  if (stationM >= sorted[sorted.length - 1]!.stationM) {
    return sorted[sorted.length - 1]!.elevationM;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (stationM >= a.stationM && stationM <= b.stationM) {
      const t = (stationM - a.stationM) / (b.stationM - a.stationM || 1);
      return a.elevationM + t * (b.elevationM - a.elevationM);
    }
  }
  return null;
}

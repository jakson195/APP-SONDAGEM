/**
 * Importação combinada: leituras ρa + topografia no mesmo ficheiro.
 */

import type { Dipolo2DInvertResult, Dipolo2DReading } from "./types";
import type { TopographyPoint } from "./topography-types";
import {
  parseTopographyDelimited,
  parseTopographyPaste,
} from "./parse-topography";
import {
  findRes2dinvTopoBlockStart,
  parseRes2dinvDat,
  parseRes2dinvTopoBlock,
  topographyFromDatReadings,
  type Res2dinvDatParseResult,
} from "./parse-res2dinv-dat";
import { parseSolodataLinhaPaste } from "./parse-solodata-linha-paste";
import { solodataLinhaToReadings } from "./solodata-linha-readings";
import {
  looksLikePrecalculatedInvertFile,
  parsePrecalculatedInvertResult,
} from "./parse-invert-model-import";
import { res2dinvDataPreset } from "./smooth-invert-2d";

export type DipoloImportBundle = {
  readings: Dipolo2DReading[];
  topography: TopographyPoint[];
  title?: string;
  unitSpacingM?: number;
  /** Modelo invertido já calculado (export DataGeo / relatório). */
  invertResult?: Dipolo2DInvertResult;
  warnings: string[];
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

const STATION_KEYS = new Set([
  "dist",
  "distance",
  "station",
  "stationm",
  "x",
  "m",
  "estacao",
]);

const ELEV_KEYS = new Set([
  "elev",
  "elevation",
  "elevacao",
  "cota",
  "z",
  "altitude",
  "alt",
  "topo",
  "cotaterreno",
]);

const RHO_KEYS = new Set([
  "rhoaohmm",
  "rhoa",
  "rap",
  "rho",
  "rhoaohm",
  "resistivity",
]);

const N_KEYS = new Set(["n", "nsep", "nivel", "sep", "fator"]);

const A_KEYS = new Set(["am", "a", "esp", "espm", "spacing"]);

/** Leituras a partir de cabeçalho com dist + n + ρa (e opcional cota na mesma tabela). */
export function parseReadingsFromDelimited(text: string): Dipolo2DReading[] {
  const bundle = parseCombinedDelimited(text);
  return bundle.readings;
}

/** Topografia a partir da coluna cota/elev na mesma tabela das leituras. */
export function parseTopographyFromCotaColumn(text: string): TopographyPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const sep = lines[0]!.includes("\t")
    ? "\t"
    : lines[0]!.includes(";")
      ? ";"
      : ",";
  const header = lines[0]!.split(sep).map(normalizeHeader);
  const iStation = header.findIndex((h) => STATION_KEYS.has(h));
  const iElev = header.findIndex((h) => ELEV_KEYS.has(h));
  if (iStation < 0 || iElev < 0) return [];

  const out: TopographyPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim());
    const st = parseNum(cols[iStation] ?? "");
    const el = parseNum(cols[iElev] ?? "");
    if (st == null || el == null) continue;
    out.push({ stationM: st, elevationM: el });
  }
  return dedupeSortTopo(out);
}

function dedupeSortTopo(points: TopographyPoint[]): TopographyPoint[] {
  const byX = new Map<number, TopographyPoint>();
  for (const p of points) {
    if (!(p.stationM >= 0 && Number.isFinite(p.elevationM))) continue;
    byX.set(Math.round(p.stationM * 1000) / 1000, p);
  }
  return [...byX.values()].sort((a, b) => a.stationM - b.stationM);
}

/** Ficheiro com leituras e/ou topografia (uma ou duas secções). */
export function parseCombinedDelimited(text: string): DipoloImportBundle {
  const warnings: string[] = [];
  const sections = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let readings: Dipolo2DReading[] = [];
  let topography: TopographyPoint[] = [];

  for (const section of sections) {
    const r = parseReadingsSection(section);
    if (r.length >= 4 && readings.length < 4) readings = r;
    const t = parseTopographyDelimited(section);
    if (t.length >= 2 && topography.length < 2) topography = t;
    const tPaste = parseTopographyPaste(section);
    if (tPaste.length >= 2 && topography.length < 2) topography = tPaste;
  }

  if (readings.length < 4) {
    readings = parseReadingsSection(text);
  }

  const topoCol = parseTopographyFromCotaColumn(text);
  if (topoCol.length >= 2) topography = topoCol;

  if (topography.length < 2) {
    const topoOnly = parseTopographyDelimited(text);
    if (topoOnly.length >= 2 && readings.length < 4) {
      topography = topoOnly;
    }
  }

  return { readings, topography, warnings };
}

function parseReadingsSection(text: string): Dipolo2DReading[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const sep = lines[0]!.includes("\t")
    ? "\t"
    : lines[0]!.includes(";")
      ? ";"
      : ",";
  const header = lines[0]!.split(sep).map(normalizeHeader);
  const iStation = header.findIndex((h) => STATION_KEYS.has(h));
  const iN = header.findIndex((h) => N_KEYS.has(h));
  const iRho = header.findIndex((h) => RHO_KEYS.has(h));
  const iA = header.findIndex((h) => A_KEYS.has(h));

  let startRow = 1;
  let useCols = iStation >= 0 && iN >= 0 && iRho >= 0;

  if (!useCols) {
    const nums = lines[0]!.split(sep).map(parseNum);
    if (
      nums.length >= 4 &&
      nums[0] != null &&
      nums[1] != null &&
      nums[2] != null &&
      nums[3] != null &&
      nums[3]! > 0
    ) {
      useCols = true;
      startRow = 0;
    }
  }

  if (!useCols) return [];

  const out: Dipolo2DReading[] = [];
  for (let i = startRow; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim());
    const station =
      startRow === 0
        ? parseNum(cols[0] ?? "")
        : parseNum(cols[iStation] ?? "");
    const n =
      startRow === 0
        ? parseNum(cols[2] ?? "")
        : parseNum(cols[iN] ?? "");
    const rho =
      startRow === 0
        ? parseNum(cols[3] ?? "")
        : parseNum(cols[iRho] ?? "");
    const a =
      startRow === 0
        ? parseNum(cols[1] ?? "")
        : iA >= 0
          ? parseNum(cols[iA] ?? "")
          : null;
    if (!(station != null && n != null && rho != null && rho > 0)) continue;
    out.push({
      stationM: station,
      n: Math.max(1, Math.round(n)),
      rhoApparentOhmM: rho,
      aM: a != null && a > 0 ? a : 15,
    });
  }
  return out;
}

/** Topografia em ficheiros .dat RES2DINV (bloco 1/N ou após 0 0 0). */
export function parseRes2dinvTopographySection(text: string): TopographyPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const topoBlock = findRes2dinvTopoBlockStart(lines);
  if (topoBlock >= 0) {
    return dedupeSortTopo(parseRes2dinvTopoBlock(lines, topoBlock));
  }

  let afterTerminator = -1;
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i]!.split(/\s+/).map(parseNum);
    if (
      parts.length >= 3 &&
      parts[0] === 0 &&
      parts[1] === 0 &&
      parts[2] === 0
    ) {
      afterTerminator = i + 1;
      break;
    }
  }
  if (afterTerminator < 0) return [];

  const pts: TopographyPoint[] = [];
  for (let i = afterTerminator; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    const parts = line.split(/\s+/).map(parseNum).filter((p) => p != null) as number[];
    if (parts.length < 2) continue;
    if (parts[0] === 4 || parts.length >= 8) continue;
    if (parts.length === 2) {
      if (parts[1]! > 9000) continue;
      pts.push({ stationM: parts[0]!, elevationM: parts[1]! });
      continue;
    }
    if (parts.length >= 3 && parts[0] === 5) {
      pts.push({ stationM: parts[1]!, elevationM: parts[2]! });
    }
  }
  return dedupeSortTopo(pts);
}

export function parseRes2dinvDatWithTopography(
  text: string,
): (Res2dinvDatParseResult & { topography: TopographyPoint[] }) | null {
  const parsed = parseRes2dinvDat(text);
  if (!parsed) return null;
  const topography = mergeTopographyImportProfiles(
    parsed.topographyFromReadings,
    extractTopographyFromImportText(text),
  );
  return { ...parsed, topography };
}

function mergeTopographyImportProfiles(
  ...profiles: TopographyPoint[][]
): TopographyPoint[] {
  const byStation = new Map<number, TopographyPoint>();
  for (const profile of profiles) {
    for (const p of profile) {
      if (p.stationM >= 0 && Number.isFinite(p.elevationM)) {
        byStation.set(Math.round(p.stationM * 1000) / 1000, p);
      }
    }
  }
  return [...byStation.values()].sort((a, b) => a.stationM - b.stationM);
}

/** Extrai topografia de .dat/.txt RES2DINV, CSV ou blocos colados. */
export function extractTopographyFromImportText(text: string): TopographyPoint[] {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];

  const parsed = parseRes2dinvDat(trimmed);
  const fromDatLines = parsed?.topographyFromReadings ?? [];

  let topo = parseRes2dinvTopographySection(trimmed);
  if (topo.length < 2) topo = parseTopographyDelimited(trimmed);
  if (topo.length < 2) topo = parseTopographyPaste(trimmed);
  const fromCol = parseTopographyFromCotaColumn(trimmed);

  return mergeTopographyImportProfiles(fromDatLines, topo, fromCol);
}

function countIndexDipoleLines(lines: string[]): number {
  let n = 0;
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const st = parseNum(parts[0] ?? "");
    const a = parseNum(parts[1] ?? "");
    const nv = parseNum(parts[2] ?? "");
    const rho = parseNum(parts[3] ?? "");
    if (st != null && a != null && nv != null && rho != null && rho > 0 && nv >= 1) {
      n++;
    }
  }
  return n;
}

/** Ficheiro RES2DINV (.dat ou .txt exportado do x2ipi/RES2DINV). */
export function looksLikeRes2dinvDat(text: string): boolean {
  const t = text.replace(/^\uFEFF/, "");
  if (/\n4\s+\S/m.test(t) || /^4\s+\S/m.test(t)) return true;
  if (/^\s*[^\n]+\r?\n\s*[\d.,]+\s*\r?\n\s*(?:11|3)\s*\r?\n/m.test(t)) {
    return true;
  }
  if (/\n0\s+0\s+0\s*(?:\r?\n|$)/m.test(t)) return true;

  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (findRes2dinvTopoBlockStart(lines) >= 0) return true;
  if (countIndexDipoleLines(lines) >= 4) return true;

  return false;
}

/** Deteta formato e importa leituras + topografia (+ modelo invertido se existir). */
export function parseDipoloImportFile(
  text: string,
  fileName?: string,
): DipoloImportBundle | null {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return null;

  const attachPrecalcModel = (
    bundle: DipoloImportBundle,
  ): DipoloImportBundle => {
    if (bundle.invertResult || !looksLikePrecalculatedInvertFile(trimmed)) {
      return bundle;
    }
    const invertResult = parsePrecalculatedInvertResult(
      trimmed,
      bundle.readings,
      res2dinvDataPreset,
    );
    if (!invertResult) return bundle;
    return {
      ...bundle,
      invertResult,
      warnings: [
        ...bundle.warnings,
        `Modelo invertido importado (${invertResult.nx}×${invertResult.nz}, RMS log₁₀=${invertResult.rmsLog10.toFixed(4)}).`,
      ],
    };
  };

  const lowerName = fileName?.toLowerCase() ?? "";
  const tryRes2dinv =
    lowerName.endsWith(".dat") ||
    lowerName.endsWith(".txt") ||
    looksLikeRes2dinvDat(trimmed);

  if (tryRes2dinv) {
    const res = parseRes2dinvDatWithTopography(trimmed);
    if (res && res.readings.length >= 4) {
      const warnings = [...res.warnings];
      let topography = res.topography;
      if (topography.length < 2) {
        warnings.push(
          "Topografia não encontrada — colunas dist/cota nas linhas «4 …», bloco 1/N ou CSV.",
        );
      }
      return attachPrecalcModel({
        readings: res.readings,
        topography: res.topography,
        title: res.title,
        unitSpacingM: res.unitSpacingM,
        warnings,
      });
    }
  }

  const combined = parseCombinedDelimited(trimmed);
  if (combined.readings.length >= 4) return attachPrecalcModel(combined);

  const topoOnly = parseTopographyDelimited(trimmed);
  if (topoOnly.length >= 2) {
    return {
      readings: [],
      topography: topoOnly,
      warnings: ["Apenas topografia — importe também leituras ρa (mín. 4)."],
    };
  }

  if (trimmed.includes("\t")) {
    const { rows } = parseSolodataLinhaPaste(trimmed, 15);
    if (rows.length >= 4) {
      const readings = solodataLinhaToReadings(
        {
          meta: { titulo: fileName ?? "Importado", linha: "1" },
          rows,
        },
        15,
      );
      if (readings.length >= 4) {
        return attachPrecalcModel({
          readings,
          topography: [],
          warnings: ["Importado como planilha SOLODATA (tabs)."],
        });
      }
    }
  }

  return combined.readings.length > 0 ? combined : null;
}

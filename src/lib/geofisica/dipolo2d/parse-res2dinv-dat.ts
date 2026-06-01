import type { Dipolo2DReading } from "./types";
import type { TopographyPoint } from "./topography-types";
import {
  defaultSolodataLinhaState,
  emptySolodataLinhaRow,
  type SolodataLinhaRow,
  type SolodataLinhaState,
} from "./solodata-linha-types";

export type Res2dinvReading = Dipolo2DReading & {
  electrodeA?: number;
  electrodeB?: number;
  electrodeM?: number;
  electrodeN?: number;
  /** Estaca / distância ao longo do perfil (coluna 4 em linhas «4 …»). */
  profileStationM?: number;
  /** Cota do terreno (coluna 5 em linhas «4 …»). */
  terrainElevationM?: number;
};

export type Res2dinvDatParseResult = {
  title: string;
  unitSpacingM: number;
  arrayType: number;
  subArrayType: number;
  readings: Res2dinvReading[];
  /** Topografia extraída das colunas dist/cota nas linhas de leitura. */
  topographyFromReadings: TopographyPoint[];
  warnings: string[];
};

function parseNum(raw: string): number | null {
  const clean = raw.replace(/\u00a0/g, "").replace(",", ".").trim();
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function isDataLine(line: string): boolean {
  return /^4\s+/.test(line.trim());
}

function isTerminatorLine(line: string): boolean {
  const parts = line.trim().split(/\s+/).map(parseNum);
  return parts.length >= 3 && parts.every((p) => p === 0);
}

/** Centro geométrico do quadrupolo e factor n (dipolo-dipolo colinear). */
function dipoleFromElectrodes(
  xA: number,
  xB: number,
  xM: number,
  xN: number,
  aM: number,
): { stationM: number; n: number } {
  const stationM = (xA + xB + xM + xN) / 4;
  const lab = Math.abs(xA - xB);
  const lmn = Math.abs(xM - xN);
  const dipoleLen = Math.max(lab, lmn, aM);
  const centerAB = (xA + xB) / 2;
  const centerMN = (xM + xN) / 2;
  const sep = Math.abs(centerMN - centerAB);
  const n = Math.max(1, Math.round(sep / Math.max(dipoleLen, 1e-6)));
  return { stationM, n };
}

/** Formato x2ipi estendido: 4 xA yA dist cota xM yM xN yN ρa (10 campos). */
function looksLikeExtendedDatTopoLine(parts: string[]): boolean {
  if (parts.length < 10 || parts[0] !== "4") return false;
  const stationM = parseNum(parts[3] ?? "");
  const elevationM = parseNum(parts[4] ?? "");
  const xM = parseNum(parts[5] ?? "");
  const rho = parseNum(parts[9] ?? parts[parts.length - 1] ?? "");
  if (
    stationM == null ||
    elevationM == null ||
    xM == null ||
    rho == null ||
    !(rho > 0)
  ) {
    return false;
  }
  if (!isReasonableElevation(elevationM)) return false;
  /** Formato clássico RES2DINV: col. 4–5 são posições B (valores pequenos, múltiplos de a). */
  const yA = parseNum(parts[2] ?? "");
  const looksClassicB =
    stationM <= 75 &&
    elevationM <= 75 &&
    (elevationM === 0 || Math.abs((elevationM % 7.5)) < 0.05) &&
    (yA == null || yA <= 75);
  if (looksClassicB && xM >= stationM) return false;
  /** Cota real de terreno (ex. Garuva ~117 m). */
  return elevationM >= 8;
}

function parseGeneralArrayLineExtended(
  line: string,
  aM: number,
): Res2dinvReading | null {
  const parts = line.trim().split(/\s+/);
  if (!looksLikeExtendedDatTopoLine(parts)) return null;

  const xA = parseNum(parts[1] ?? "");
  const profileDistM = parseNum(parts[3] ?? "");
  const elevationM = parseNum(parts[4] ?? "");
  const xM = parseNum(parts[5] ?? "");
  const xN = parseNum(parts[7] ?? "");
  let rho = parseNum(parts[9] ?? "");
  if (rho == null && parts.length > 10) {
    rho = parseNum(parts[parts.length - 1] ?? "");
  }

  if (
    xA == null ||
    profileDistM == null ||
    elevationM == null ||
    xM == null ||
    xN == null ||
    rho == null ||
    !(rho > 0)
  ) {
    return null;
  }

  const xB = xA + aM;
  const { stationM, n } = dipoleFromElectrodes(xA, xB, xM, xN, aM);

  return {
    stationM,
    n,
    rhoApparentOhmM: rho,
    aM,
    electrodeA: xA,
    electrodeB: xB,
    electrodeM: xM,
    electrodeN: xN,
    profileStationM: profileDistM,
    terrainElevationM: elevationM,
  };
}

function parseGeneralArrayLine(
  line: string,
  aM: number,
): Res2dinvReading | null {
  const extended = parseGeneralArrayLineExtended(line, aM);
  if (extended) return extended;

  const parts = line.trim().split(/\s+/);
  if (parts.length < 10 || parts[0] !== "4") return null;
  const xA = parseNum(parts[1] ?? "");
  const xB = parseNum(parts[3] ?? "");
  const xM = parseNum(parts[5] ?? "");
  const xN = parseNum(parts[7] ?? "");
  let rho = parseNum(parts[9] ?? "");
  if (rho == null && parts.length > 10) {
    rho = parseNum(parts[parts.length - 1] ?? "");
  }
  if (
    xA == null ||
    xB == null ||
    xM == null ||
    xN == null ||
    rho == null ||
    !(rho > 0)
  ) {
    return null;
  }
  const { stationM, n } = dipoleFromElectrodes(xA, xB, xM, xN, aM);
  return {
    stationM,
    n,
    rhoApparentOhmM: rho,
    aM,
    electrodeA: xA,
    electrodeB: xB,
    electrodeM: xM,
    electrodeN: xN,
  };
}

function parseIndexDipoleLine(
  line: string,
  aM: number,
): Dipolo2DReading | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const stationM = parseNum(parts[0] ?? "");
  const aCell = parseNum(parts[1] ?? "");
  const nVal = parseNum(parts[2] ?? "");
  const rho = parseNum(parts[3] ?? "");
  if (
    stationM == null ||
    nVal == null ||
    rho == null ||
    !(rho > 0) ||
    !(nVal >= 1)
  ) {
    return null;
  }
  const aUse = aCell != null && aCell > 0 ? aCell : aM;
  return {
    stationM,
    n: Math.max(1, Math.round(nVal)),
    rhoApparentOhmM: rho,
    aM: aUse,
  };
}

function pushHeaderNumbers(line: string, headerNums: number[]): void {
  const n = parseNum(line);
  if (n != null) headerNums.push(n);
}

function isReasonableElevation(elev: number): boolean {
  return elev > -500 && elev < 9000;
}

function isReasonableTopoPair(distM: number, elevM: number): boolean {
  return distM >= 0 && isReasonableElevation(elevM);
}

/** RES2DINV / x2ipi: linha «1», contagem, pares distância–cota (m). */
export function findRes2dinvTopoBlockStart(lines: string[]): number {
  for (let i = 0; i < lines.length - 2; i++) {
    const a = lines[i]!.trim().split(/\s+/);
    const b = lines[i + 1]!.trim().split(/\s+/);
    if (a.length !== 1 || b.length !== 1) continue;
    const flag = parseNum(a[0]!);
    const count = parseNum(b[0]!);
    if (flag !== 1 || count == null || count < 2 || count > 500) continue;

    let ok = 0;
    for (let j = 0; j < Math.min(count, 4); j++) {
      const parts = lines[i + 2 + j]!
        .trim()
        .split(/\s+/)
        .map(parseNum);
      if (
        parts.length === 2 &&
        parts[0] != null &&
        parts[1] != null &&
        isReasonableTopoPair(parts[0], parts[1])
      ) {
        ok++;
      }
    }
    if (ok >= 2) return i;
  }
  return -1;
}

export function parseRes2dinvTopoBlock(
  lines: string[],
  startIdx: number,
): { stationM: number; elevationM: number }[] {
  const count = parseNum(lines[startIdx + 1]!.trim());
  if (count == null || count < 2) return [];

  const pts: { stationM: number; elevationM: number }[] = [];
  for (let j = 0; j < count; j++) {
    const line = lines[startIdx + 2 + j];
    if (!line?.trim()) break;
    const parts = line.trim().split(/\s+/).map(parseNum);
    if (parts.length !== 2 || parts[0] == null || parts[1] == null) continue;
    if (!isReasonableTopoPair(parts[0], parts[1])) continue;
    pts.push({ stationM: parts[0], elevationM: parts[1] });
  }
  return pts;
}

function dedupeReadings(readings: Res2dinvReading[]): Res2dinvReading[] {
  const seen = new Set<string>();
  const out: Res2dinvReading[] = [];
  for (const r of readings) {
    const key = `${Math.round(r.stationM * 1000)}|${r.n}|${r.aM}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Topografia a partir das colunas 4 (estaca) e 5 (cota) das linhas «4 …». */
export function topographyFromDatReadings(
  readings: Res2dinvReading[],
): TopographyPoint[] {
  const byStation = new Map<number, TopographyPoint>();
  for (const r of readings) {
    if (
      r.profileStationM == null ||
      r.terrainElevationM == null ||
      !Number.isFinite(r.profileStationM) ||
      !Number.isFinite(r.terrainElevationM)
    ) {
      continue;
    }
    const key = Math.round(r.profileStationM * 1000) / 1000;
    if (!byStation.has(key)) {
      byStation.set(key, {
        stationM: r.profileStationM,
        elevationM: r.terrainElevationM,
      });
    }
  }
  return [...byStation.values()].sort((a, b) => a.stationM - b.stationM);
}

/**
 * Importa ficheiros .dat RES2DINV (formato geral, sub-array dipolo-dipolo 3)
 * e formato indexado dipolo-dipolo (array type 3).
 */
export function parseRes2dinvDat(text: string): Res2dinvDatParseResult | null {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rawLines = cleaned.split(/\r?\n/).map((l) => l.trim());
  const lines = rawLines.filter((l) => l.length > 0);
  if (lines.length < 4) return null;

  const title = lines[0] ?? "Importado RES2DINV";
  const headerNums: number[] = [];
  let dataStart = 1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (isDataLine(line)) {
      dataStart = i;
      break;
    }
    pushHeaderNumbers(line, headerNums);
  }

  if (headerNums.length < 4) return null;

  const unitSpacingM = headerNums[0]! > 0 ? headerNums[0]! : 7.5;
  const arrayType = headerNums[1] ?? 11;
  let subArrayType = 0;
  let measureType = 0;
  let expectedCount: number | null = null;
  let idx = 2;

  if (arrayType === 11) {
    subArrayType = headerNums[idx] ?? 0;
    idx++;
    measureType = headerNums[idx] ?? 0;
    idx++;
    expectedCount = headerNums[idx] ?? null;
    idx++;
    void headerNums[idx];
    void headerNums[idx + 1];
  } else if (arrayType === 3) {
    expectedCount = headerNums[idx] ?? null;
    idx++;
    measureType = headerNums[idx] ?? 0;
    idx++;
  } else {
    subArrayType = headerNums[idx] ?? 0;
    idx++;
    expectedCount = headerNums[idx] ?? null;
  }

  void measureType;

  const topoBlockStart = findRes2dinvTopoBlockStart(lines);
  const dataEnd = topoBlockStart >= 0 ? topoBlockStart : lines.length;

  const readings: Res2dinvReading[] = [];
  const warnings: string[] = [];

  for (let i = dataStart; i < dataEnd; i++) {
    const line = lines[i]!;
    if (isTerminatorLine(line)) break;

    if (isDataLine(line)) {
      const r = parseGeneralArrayLine(line, unitSpacingM);
      if (r) readings.push(r);
      continue;
    }

    const rIdx = parseIndexDipoleLine(line, unitSpacingM);
    if (rIdx) readings.push(rIdx);
  }

  let uniqueReadings = dedupeReadings(readings);

  if (uniqueReadings.length < 4) return null;

  if (expectedCount != null && uniqueReadings.length !== expectedCount) {
    warnings.push(
      `Cabeçalho indica ${expectedCount} leituras; importadas ${uniqueReadings.length}.`,
    );
  }

  if (arrayType === 11 && subArrayType !== 3) {
    warnings.push(
      `Sub-array ${subArrayType}: assumido dipolo-dipolo a partir das posições A,B,M,N.`,
    );
  }

  return {
    title,
    unitSpacingM,
    arrayType,
    subArrayType,
    readings: uniqueReadings,
    /** Topografia de todas as linhas parseadas (antes de deduplicar leituras). */
    topographyFromReadings: topographyFromDatReadings(readings),
    warnings,
  };
}

function readingToSolodataRow(r: Res2dinvReading, medida: number): SolodataLinhaRow {
  return {
    medida,
    piquete: 1,
    espM: r.aM,
    a: r.electrodeA ?? null,
    b: r.electrodeB ?? null,
    m: r.electrodeM ?? null,
    nEl: r.electrodeN ?? null,
    nivel: r.n,
    spMv: null,
    vMv: null,
    iMa: null,
    g: null,
    k: null,
    rapCalc: null,
    a2: null,
    b2: null,
    m2: null,
    n2: null,
    dist: r.stationM,
    esp: r.aM,
    nSep: r.n,
    rap: r.rhoApparentOhmM,
    cota: r.terrainElevationM ?? null,
    excluded: false,
  };
}

/** Converte importação RES2DINV para estado da folha SOLODATA. */
export function res2dinvToSolodataLinha(
  parsed: Res2dinvDatParseResult,
  base?: SolodataLinhaState,
): SolodataLinhaState {
  const rowCount = Math.max(parsed.readings.length, 91);
  const rows = parsed.readings.map((r, i) => readingToSolodataRow(r, i + 1));
  while (rows.length < rowCount) {
    const blank = emptySolodataLinhaRow(rows.length + 1);
    blank.esp = parsed.unitSpacingM;
    blank.espM = parsed.unitSpacingM;
    rows.push(blank);
  }
  const prev = base ?? defaultSolodataLinhaState(rowCount);
  return {
    meta: {
      titulo: parsed.title.slice(0, 120),
      linha: prev.meta.linha,
    },
    rows,
  };
}

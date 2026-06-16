import type { SolodataLinhaRow } from "./solodata-linha-types";
import { parseDipolo2DPaste } from "./parse-paste";
import { parseNumCell, looksLikeElectrodeBlock, isElectrodeFieldHeader, isElectrodeHeader } from "./solodata-grid-paste";

function parseNum(raw: string): number | null {
  return parseNumCell(raw);
}

function splitRow(line: string): string[] {
  const t = line.trim();
  if (!t) return [];
  if (t.includes("\t")) return t.split("\t").map((c) => c.trim());
  if (t.includes(";")) return t.split(";").map((c) => c.trim());
  return t.split(/[ ,]+/).filter(Boolean);
}

function rowFromCells(cells: string[]): SolodataLinhaRow | null {
  const nums = cells.map(parseNum);
  if (nums.length >= 24) {
    return {
      medida: nums[0],
      piquete: nums[1],
      espM: nums[2],
      a: nums[3],
      b: nums[4],
      m: nums[5],
      nEl: nums[6],
      nivel: nums[7],
      spMv: nums[8],
      vMv: nums[9],
      iMa: nums[10],
      g: nums[11],
      k: nums[12],
      rapCalc: nums[13],
      a2: nums[15] ?? null,
      b2: nums[16] ?? null,
      m2: nums[17] ?? null,
      n2: nums[18] ?? null,
      dist: nums[20],
      esp: nums[21],
      nSep: nums[22],
      rap: nums[23],
    };
  }
  if (nums.length >= 11 && nums.length < 14) {
    return {
      medida: nums[0],
      piquete: nums[1],
      espM: nums[2],
      a: nums[3],
      b: nums[4],
      m: nums[5],
      nEl: nums[6],
      nivel: nums[7],
      spMv: nums[8],
      vMv: nums[9],
      iMa: nums[10],
      g: null,
      k: null,
      rapCalc: null,
      a2: null,
      b2: null,
      m2: null,
      n2: null,
      dist: null,
      esp: nums[2],
      nSep: nums[7],
      rap: null,
    };
  }
  if (nums.length >= 14) {
    return {
      medida: nums[0],
      piquete: nums[1],
      espM: nums[2],
      a: nums[3],
      b: nums[4],
      m: nums[5],
      nEl: nums[6],
      nivel: nums[7],
      spMv: nums[8],
      vMv: nums[9],
      iMa: nums[10],
      g: nums[11],
      k: nums[12],
      rapCalc: nums[13],
      a2: null,
      b2: null,
      m2: null,
      n2: null,
      dist: null,
      esp: nums[2],
      nSep: nums[7],
      rap: nums[13],
    };
  }
  if (nums.length >= 3 && nums.length < 4) {
    return {
      medida: null,
      piquete: null,
      espM: null,
      a: null,
      b: null,
      m: null,
      nEl: null,
      nivel: null,
      spMv: nums[0],
      vMv: nums[1],
      iMa: nums[2],
      g: null,
      k: null,
      rapCalc: null,
      a2: null,
      b2: null,
      m2: null,
      n2: null,
      dist: null,
      esp: null,
      nSep: null,
      rap: null,
    };
  }
  if (nums.length === 8) {
    const probe = {
      a: nums[0],
      b: nums[1],
      m: nums[2],
      nEl: nums[3],
      nivel: nums[4],
    };
    if (looksLikeElectrodeBlock([probe])) {
      return {
        medida: null,
        piquete: null,
        espM: null,
        a: nums[0],
        b: nums[1],
        m: nums[2],
        nEl: nums[3],
        nivel: nums[4],
        spMv: nums[5],
        vMv: nums[6],
        iMa: nums[7],
        g: null,
        k: null,
        rapCalc: null,
        a2: null,
        b2: null,
        m2: null,
        n2: null,
        dist: null,
        esp: null,
        nSep: nums[4],
        rap: null,
      };
    }
  }
  if (nums.length >= 8 && nums.length < 11) {
    return {
      medida: nums[0],
      piquete: nums[1],
      espM: nums[2],
      a: nums[3],
      b: nums[4],
      m: nums[5],
      nEl: nums[6],
      nivel: nums[7],
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
      dist: null,
      esp: nums[2],
      nSep: nums[7],
      rap: null,
    };
  }
  if (nums.length === 5) {
    return {
      medida: null,
      piquete: null,
      espM: null,
      a: nums[0],
      b: nums[1],
      m: nums[2],
      nEl: nums[3],
      nivel: nums[4],
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
      dist: null,
      esp: null,
      nSep: null,
      rap: null,
    };
  }
  if (nums.length >= 4 && nums.length < 8) {
    return {
      medida: null,
      piquete: null,
      espM: nums[1],
      a: null,
      b: null,
      m: null,
      nEl: null,
      nivel: nums[2],
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
      dist: nums[0],
      esp: nums[1],
      nSep: nums[2],
      rap: nums[3],
    };
  }
  return null;
}

function isHeaderLine(cells: string[]): boolean {
  const u = cells.join(" ").toUpperCase();
  return (
    u.includes("MEDIDA") ||
    u.includes("PIQUETE") ||
    u.includes("DIST") ||
    isElectrodeFieldHeader(cells) ||
    (cells.length <= 5 && isElectrodeHeader(cells))
  );
}

/**
 * Cola da folha Excel SOLODATA (linha completa com tabs) ou bloco Dist/Esp/N/Rap.
 */
export function parseSolodataLinhaPaste(
  text: string,
  defaultAM: number,
): { rows: SolodataLinhaRow[]; errors: string[] } {
  const lines = text.split(/\r\n|\n\r|\n|\r/).filter((l) => l.trim());
  const errors: string[] = [];
  const out: SolodataLinhaRow[] = [];

  for (const line of lines) {
    const cells = splitRow(line);
    if (cells.length === 0) continue;
    if (isHeaderLine(cells)) continue;
    if (/MODELO|PLANILHAR|GEOFISICA/i.test(line) && cells.length < 4) continue;

    const row = rowFromCells(cells);
    if (row) {
      out.push(row);
      continue;
    }
  }

  if (out.length > 0) return { rows: out, errors };

  const { readings, errors: e2 } = parseDipolo2DPaste(text, defaultAM);
  if (readings.length > 0) {
    return {
      rows: readings.map((L, i) => ({
        medida: i + 1,
        piquete: 1,
        espM: L.aM,
        a: null,
        b: null,
        m: null,
        nEl: null,
        nivel: L.n,
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
        dist: L.stationM,
        esp: L.aM,
        nSep: L.n,
        rap: L.rhoApparentOhmM,
      })),
      errors: e2,
    };
  }

  errors.push(
    "Não foi possível ler a colagem. Cole a folha inteira (com tabs) ou 4 colunas: Dist, Esp, N, R ap.",
  );
  return { rows: [], errors };
}

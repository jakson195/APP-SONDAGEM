import type { Dipolo2DReading } from "./types";

function splitLine(line: string): string[] {
  const t = line.trim();
  if (!t) return [];
  if (t.includes("\t")) return t.split("\t").map((c) => c.trim());
  if (t.includes(";")) return t.split(";").map((c) => c.trim());
  return t.split(/[ ,]+/).map((c) => c.trim()).filter(Boolean);
}

function parseNum(raw: string): number {
  const n = Number(raw.replace(",", ".").trim());
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Valores numéricos consecutivos a partir da esquerda. */
export function leadingNumericValues(cells: string[]): number[] {
  const v: number[] = [];
  for (const c of cells) {
    const n = parseNum(c);
    if (!Number.isFinite(n)) break;
    v.push(n);
  }
  return v;
}

function isLikelyFooterLine(line: string): boolean {
  const u = line.toUpperCase();
  return (
    u.includes("MODELO") ||
    u.includes("PLANILHAR") ||
    u.includes("DADOS DEPOIS")
  );
}

function rowLooksLikeColumnHeader(cells: string[]): boolean {
  const lower = cells.map((c) => c.toLowerCase());
  const hasRho = lower.some((c) =>
    ["rho", "ρ", "res", "ohm", "app", "ra"].some((k) => c.includes(k)),
  );
  const hasSt = lower.some((c) =>
    ["estação", "estacao", "station", "x", "dist", "perfil"].some((k) =>
      c.replace(/\s/g, "").includes(k.replace(/\s/g, "")),
    ),
  );
  const hasN = lower.some((c) => {
    const t = c.trim();
    return (
      ["nível", "nivel", "sep", "fator"].some((k) => t.includes(k)) ||
      /^n\s*$/i.test(t) ||
      /^n[º°]?\s*$/i.test(t)
    );
  });
  return (hasSt || hasRho) && hasN && leadingNumericValues(cells).length < 2;
}

/**
 * Distingue 4 colunas:
 * - `st_a_n_rho`: estação, a (m), n, ρa (SOLODATA / export comum)
 * - `st_n_rho`: estação, n, ρa [, a]
 */
function inferQuadLayout(fourColRows: number[][]): "st_a_n_rho" | "st_n_rho" {
  if (fourColRows.length === 0) return "st_n_rho";
  const intSmall = (x: number) =>
    Math.abs(x - Math.round(x)) < 1e-5 && x >= 1 && x <= 80;

  if (fourColRows.length < 4) {
    const r = fourColRows[fourColRows.length - 1]!;
    if (r.length < 4) return "st_n_rho";
    const c = r[2]!;
    const d = r[3]!;
    if (intSmall(c) && c <= 40 && d > Math.max(40, c * 8)) return "st_a_n_rho";
    return "st_n_rho";
  }
  const c1 = fourColRows.map((r) => r[1]!);
  const c2 = fourColRows.map((r) => r[2]!);
  const uniq1 = new Set(c1.map((x) => Math.round(x * 1e6) / 1e6)).size;
  const uniq2 = new Set(c2.map((x) => Math.round(x * 1e6) / 1e6)).size;
  const frac2Int =
    fourColRows.reduce((s, r) => s + (intSmall(r[2]!) ? 1 : 0), 0) /
    fourColRows.length;
  const frac3Rho =
    fourColRows.reduce((s, r) => s + (r[3]! > 0 && r[3]! < 1e12 ? 1 : 0), 0) /
    fourColRows.length;
  const frac1Int =
    fourColRows.reduce((s, r) => s + (intSmall(r[1]!) ? 1 : 0), 0) /
    fourColRows.length;
  const frac2Rho =
    fourColRows.reduce((s, r) => s + (r[2]! > 0 && r[2]! < 1e12 ? 1 : 0), 0) /
    fourColRows.length;

  const maxU1 = Math.max(2, Math.ceil(fourColRows.length * 0.08));
  const sanr =
    uniq1 <= maxU1 &&
    uniq2 >= Math.min(4, Math.ceil(fourColRows.length * 0.05)) &&
    frac2Int > 0.85 &&
    frac3Rho > 0.9;
  const snr =
    frac1Int > 0.85 &&
    frac2Rho > 0.9 &&
    uniq1 >= Math.min(4, Math.ceil(fourColRows.length * 0.04));

  if (sanr && !snr) return "st_a_n_rho";
  if (!sanr && snr) return "st_n_rho";
  if (sanr && snr) return uniq1 <= 3 ? "st_a_n_rho" : "st_n_rho";
  return "st_n_rho";
}

function readingFromNumericTail(
  v: number[],
  quad: "st_a_n_rho" | "st_n_rho",
  defaultAM: number,
): Dipolo2DReading | null {
  if (v.length >= 4 && quad === "st_a_n_rho") {
    const st = v[0]!;
    const a = v[1]!;
    const n = v[2]!;
    const rho = v[3]!;
    const aUse = a > 0 && Number.isFinite(a) ? a : defaultAM;
    if (!Number.isFinite(st) || !(n >= 1) || !(rho > 0)) return null;
    return {
      stationM: st,
      n: Math.max(1, Math.round(n)),
      rhoApparentOhmM: rho,
      aM: aUse,
    };
  }
  if (v.length >= 3) {
    const st = v[0]!;
    const n = v[1]!;
    const rho = v[2]!;
    let aUse = defaultAM;
    if (v.length >= 4 && quad === "st_n_rho") {
      const a4 = v[3]!;
      if (a4 > 0 && Number.isFinite(a4)) aUse = a4;
    }
    if (!Number.isFinite(st) || !(n >= 1) || !(rho > 0)) return null;
    return {
      stationM: st,
      n: Math.max(1, Math.round(n)),
      rhoApparentOhmM: rho,
      aM: aUse,
    };
  }
  return null;
}

type HeaderMap = {
  colStation: number;
  colN: number;
  colRho: number;
  colA: number;
};

function parseHeaderRow(cells: string[]): HeaderMap | null {
  if (!rowLooksLikeColumnHeader(cells)) return null;
  const lower = cells.map((c) => c.toLowerCase());
  const find = (pred: (s: string) => boolean) => lower.findIndex(pred);
  const iSt = find((c) =>
    ["estação", "estacao", "station", "x", "dist", "perfil"].some((k) => c.includes(k)),
  );
  const iN = find((c) => {
    const t = c.trim().toLowerCase();
    return (
      ["nível", "nivel", "sep", "fator"].some((k) => t.includes(k)) ||
      /^n\s*$/.test(t) ||
      /^n[º°]?\s*$/i.test(t)
    );
  });
  const iR = find((c) => ["rho", "res", "ohm", "app", "ρ", "ra"].some((k) => c.includes(k)));
  const iA = find((c) =>
    ["dipolo", "spacing", "ab/2", "ab"].some((k) => c.includes(k)) ||
    c.trim() === "a" ||
    c.startsWith("a "),
  );
  if (iSt < 0 || iN < 0 || iR < 0) return null;
  return {
    colStation: iSt,
    colN: iN,
    colRho: iR,
    colA: iA,
  };
}

export function parseDipolo2DPaste(
  text: string,
  defaultAM: number,
): { readings: Dipolo2DReading[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r\n|\n\r|\n|\r/);

  let header: HeaderMap | null = null;
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cells = splitLine(line);
    const h = parseHeaderRow(cells);
    if (h) {
      header = h;
      headerLineIdx = i;
      break;
    }
  }

  const readings: Dipolo2DReading[] = [];
  const numericTails: number[][] = [];

  for (let r = 0; r < lines.length; r++) {
    const raw = lines[r]!;
    const line = raw.trim();
    if (!line || isLikelyFooterLine(line)) continue;
    if (header && r === headerLineIdx) continue;

    const cells = splitLine(line);

    if (header) {
      const st = parseNum(cells[header.colStation] ?? "");
      const nn = parseNum(cells[header.colN] ?? "");
      const rho = parseNum(cells[header.colRho] ?? "");
      let aUse = defaultAM;
      if (header.colA >= 0) {
        const a = parseNum(cells[header.colA] ?? "");
        if (a > 0 && Number.isFinite(a)) aUse = a;
      }
      if (!Number.isFinite(st) || !Number.isFinite(nn) || !(rho > 0)) continue;
      readings.push({
        stationM: st,
        n: Math.max(1, Math.round(nn)),
        rhoApparentOhmM: rho,
        aM: aUse,
      });
      continue;
    }

    const v = leadingNumericValues(cells);
    if (v.length < 3) continue;
    numericTails.push(v);
  }

  if (!header && numericTails.length > 0) {
    const four = numericTails.filter((v) => v.length >= 4);
    const quad =
      four.length >= Math.max(4, Math.ceil(numericTails.length * 0.25))
        ? inferQuadLayout(four.map((v) => v.slice(0, 4)))
        : "st_n_rho";
    for (const v of numericTails) {
      const L = readingFromNumericTail(v, quad, defaultAM);
      if (L) readings.push(L);
    }
  }

  if (readings.length === 0) {
    errors.push(
      "Não foi possível extrair leituras. Use 4 colunas: estação (m), a (m), n, ρa (Ω·m) — ou estação, n, ρa com a por defeito.",
    );
  }
  return { readings, errors };
}

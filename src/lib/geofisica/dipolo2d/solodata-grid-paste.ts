import type { SolodataLinhaRow } from "./solodata-linha-types";

export function parseNumCell(raw: string): number | null {
  let clean = raw.replace(/\u00a0/g, "").trim();
  if (!clean || clean === "-") return null;
  clean = clean.replace(/\s/g, "");
  // Formato PT: 1.234,56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else {
    clean = clean.replace(",", ".");
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Matriz tab/linha do Excel (TSV). */
export function parseClipboardGrid(text: string): string[][] {
  const lines = text.split(/\r\n|\n\r|\n|\r/).filter((l) => l.length > 0);
  return lines.map((line) => {
    if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
    if (line.includes(";")) return line.split(";").map((c) => c.trim());
    return [line.trim()];
  });
}

export function isMultiCellPaste(text: string): boolean {
  return text.includes("\t") || /\r\n|\n\r|\n|\r/.test(text);
}

export function emptySolodataRow(medida = 1, espM = 15): SolodataLinhaRow {
  return {
    medida,
    piquete: 1,
    espM,
    a: null,
    b: null,
    m: null,
    nEl: null,
    nivel: null,
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
    esp: espM,
    nSep: null,
    rap: null,
    excluded: false,
  };
}

/** Aplica bloco colado a partir da célula (rowIdx, colIdx). */
export function applyGridToSolodataRows(
  rows: SolodataLinhaRow[],
  grid: string[][],
  startRow: number,
  startCol: number,
  colKeys: (keyof SolodataLinhaRow)[],
  defaultEspM = 15,
): SolodataLinhaRow[] {
  const next = rows.map((r) => ({ ...r }));

  for (let r = 0; r < grid.length; r++) {
    const rowIdx = startRow + r;
    while (rowIdx >= next.length) {
      const med =
        next.length > 0 ? (next[next.length - 1]!.medida ?? next.length) + 1 : 1;
      next.push(emptySolodataRow(med, defaultEspM));
    }
    const line = grid[r]!;
    for (let c = 0; c < line.length; c++) {
      const colIdx = startCol + c;
      if (colIdx < 0 || colIdx >= colKeys.length) continue;
      const key = colKeys[colIdx]!;
      if (key === "excluded") continue;
      const raw = line[c] ?? "";
      if (!raw.trim()) {
        (next[rowIdx] as Record<string, unknown>)[key] = null;
        continue;
      }
      const val = parseNumCell(raw);
      if (val != null) {
        (next[rowIdx] as Record<string, unknown>)[key] = val;
      }
    }
  }

  return next;
}

/** Três colunas SP, V, i (com ou sem cabeçalho). */
export function isSpViHeader(cells: string[]): boolean {
  const u = cells.join(" ").toUpperCase();
  return u.includes("SP") && (u.includes("V") || u.includes("(MV)"));
}

/** Cabeçalho A, B, M, N, NIV. */
export function isElectrodeHeader(cells: string[]): boolean {
  const u = cells.join(" ").toUpperCase().replace(/\./g, "");
  const hasAb = u.includes("A") && u.includes("B");
  const hasMn = u.includes("M") && (u.includes("N") || u.includes("NIV"));
  return hasAb && hasMn;
}

export function parseElectrodeBlock(text: string): {
  rows: Pick<SolodataLinhaRow, "a" | "b" | "m" | "nEl" | "nivel">[];
} {
  const grid = parseClipboardGrid(text);
  const out: Pick<SolodataLinhaRow, "a" | "b" | "m" | "nEl" | "nivel">[] = [];
  for (const line of grid) {
    if (line.length < 5) continue;
    if (isElectrodeHeader(line)) continue;
    const a = parseNumCell(line[0]!);
    const b = parseNumCell(line[1]!);
    const m = parseNumCell(line[2]!);
    const nEl = parseNumCell(line[3]!);
    const nivel = parseNumCell(line[4]!);
    if (a == null && b == null && m == null && nEl == null && nivel == null) {
      continue;
    }
    out.push({ a, b, m, nEl, nivel });
  }
  return { rows: out };
}

export function applyElectrodeToRows(
  rows: SolodataLinhaRow[],
  block: Pick<SolodataLinhaRow, "a" | "b" | "m" | "nEl" | "nivel">[],
  startRow: number,
  defaultEspM = 15,
): SolodataLinhaRow[] {
  const next = rows.map((r) => ({ ...r }));
  for (let i = 0; i < block.length; i++) {
    const rowIdx = startRow + i;
    while (rowIdx >= next.length) {
      const med =
        next.length > 0 ? (next[next.length - 1]!.medida ?? next.length) + 1 : 1;
      next.push(emptySolodataRow(med, defaultEspM));
    }
    next[rowIdx] = { ...next[rowIdx]!, ...block[i]! };
  }
  return next;
}

export function looksLikeElectrodeBlock(
  block: Pick<SolodataLinhaRow, "a" | "b" | "m" | "nEl" | "nivel">[],
): boolean {
  if (block.length === 0) return false;
  let hits = 0;
  for (const row of block) {
    const vals = [row.a, row.b, row.m, row.nEl, row.nivel];
    if (
      vals.every(
        (v) =>
          v != null && v >= 1 && v <= 120 && Math.abs(v - Math.round(v)) < 0.05,
      )
    ) {
      hits++;
    }
  }
  return hits >= Math.max(1, Math.ceil(block.length * 0.6));
}

export function parseSpViBlock(text: string): {
  rows: Pick<SolodataLinhaRow, "spMv" | "vMv" | "iMa">[];
} {
  const grid = parseClipboardGrid(text);
  const out: Pick<SolodataLinhaRow, "spMv" | "vMv" | "iMa">[] = [];
  for (const line of grid) {
    if (line.length < 3) continue;
    if (isSpViHeader(line)) continue;
    const sp = parseNumCell(line[0]!);
    const v = parseNumCell(line[1]!);
    const i = parseNumCell(line[2]!);
    if (sp == null && v == null && i == null) continue;
    out.push({ spMv: sp, vMv: v, iMa: i });
  }
  return { rows: out };
}

export function applySpViToRows(
  rows: SolodataLinhaRow[],
  block: Pick<SolodataLinhaRow, "spMv" | "vMv" | "iMa">[],
  startRow: number,
  defaultEspM = 15,
): SolodataLinhaRow[] {
  const next = rows.map((r) => ({ ...r }));
  for (let i = 0; i < block.length; i++) {
    const rowIdx = startRow + i;
    while (rowIdx >= next.length) {
      const med =
        next.length > 0 ? (next[next.length - 1]!.medida ?? next.length) + 1 : 1;
      next.push(emptySolodataRow(med, defaultEspM));
    }
    next[rowIdx] = { ...next[rowIdx]!, ...block[i]! };
  }
  return next;
}

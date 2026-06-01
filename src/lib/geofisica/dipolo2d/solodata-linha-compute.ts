import type { SolodataLinhaRow, SolodataLinhaState } from "./solodata-linha-types";

const PI = Math.PI;

/**
 * Coluna G (SOLODATA / Excel):
 * =1/((1/H2)-(2/(H2+1))+(1/(H2+2)))
 * H = NIVEL (factor n).
 */
export function solodataGFromNivel(nivel: number): number | null {
  const h = Math.max(1, Math.round(nivel));
  const denom = 1 / h - 2 / (h + 1) + 1 / (h + 2);
  if (Math.abs(denom) < 1e-15) return null;
  return 1 / denom;
}

/**
 * Coluna K (SOLODATA / Excel):
 * =2*PI()*L2*C2  →  K = 2·π·G·ESP
 */
export function solodataKFromG(g: number, espM: number): number {
  const esp = espM > 0 ? espM : 15;
  const raw = 2 * PI * g * esp;
  return Math.round(raw * 10) / 10;
}

/**
 * Coluna Rap (SOLODATA / Excel):
 * =ABS(((J2-I2)/K2)*M2)  →  |((V−SP)/i)·K|
 * J=V (mV), I=SP (mV), K=i (mA), M=factor K (Ω·m).
 */
export function solodataRapFromField(
  k: number,
  vMv: number,
  spMv: number | null,
  iMa: number,
): number | null {
  if (!(iMa > 0) || !Number.isFinite(vMv) || !Number.isFinite(k)) return null;
  return Math.abs(((vMv - (spMv ?? 0)) / iMa) * k);
}

/** @deprecated Use solodataGFromNivel — equivalente a n(n+1)(n+2)/2. */
export function solodataGFactor(n: number): number {
  const g = solodataGFromNivel(n);
  return g ?? 0;
}

/** @deprecated Use solodataKFromG — equivalente a π·a·n·(n+1)·(n+2). */
export function solodataKFactor(espM: number, n: number): number {
  const g = solodataGFromNivel(n);
  if (g == null) return 0;
  return solodataKFromG(g, espM);
}

function usesElectrodeIndices(row: SolodataLinhaRow): boolean {
  const { a, b, m, nEl } = row;
  if (a == null || b == null || m == null || nEl == null) return false;
  const vals = [a, b, m, nEl];
  if (vals.some((v) => !Number.isFinite(v))) return false;
  if (vals.some((v) => Math.abs(v - Math.round(v)) > 0.05)) return false;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const esp = row.espM ?? row.esp ?? 15;
  if (max > 35) return false;
  if (max - min >= esp * 2) return false;
  return a >= 1;
}

export function electrodePositionsM(
  row: SolodataLinhaRow,
  defaultAM: number,
): { a2: number; b2: number; m2: number; n2: number } | null {
  const { a, b, m, nEl } = row;
  if (a == null || b == null || m == null || nEl == null) return null;
  const esp = row.espM ?? row.esp ?? defaultAM;
  if (!(esp > 0)) return null;

  if (usesElectrodeIndices(row)) {
    return {
      a2: (a - 1) * esp,
      b2: (b - 1) * esp,
      m2: (m - 1) * esp,
      n2: (nEl - 1) * esp,
    };
  }
  return { a2: a, b2: b, m2: m, n2: nEl };
}

export function nSepFromElectrodes(
  a2: number,
  b2: number,
  m2: number,
  n2: number,
  espM: number,
): number {
  const lab = Math.abs(a2 - b2);
  const lmn = Math.abs(m2 - n2);
  const dipoleLen = Math.max(lab, lmn, espM);
  const centerAB = (a2 + b2) / 2;
  const centerMN = (m2 + n2) / 2;
  const sep = Math.abs(centerMN - centerAB);
  return Math.max(1, Math.round(sep / Math.max(dipoleLen, 1e-6)));
}

/** Calcula G, K, Rap, posições e perfil 2D para uma linha SOLODATA. */
export function computeSolodataLinhaRow(
  row: SolodataLinhaRow,
  defaultAM: number,
): SolodataLinhaRow {
  const espDef = defaultAM > 0 ? defaultAM : 15;
  const esp = row.espM ?? row.esp ?? espDef;
  const pos = electrodePositionsM(row, espDef);

  const nFromElectrodes = pos
    ? nSepFromElectrodes(pos.a2, pos.b2, pos.m2, pos.n2, esp)
    : null;

  /** H na fórmula Excel = NIVEL (prioridade) ou N calculado. */
  const nivel =
    row.nivel ??
    row.nSep ??
    nFromElectrodes;

  if (nivel == null || !(nivel >= 1)) {
    return { ...row, esp: row.esp ?? esp, espM: row.espM ?? esp };
  }

  const g = solodataGFromNivel(nivel);
  if (g == null) {
    return { ...row, esp: row.esp ?? esp, espM: row.espM ?? esp };
  }

  const k = solodataKFromG(g, esp);

  let rapCalc: number | null = null;
  if (
    row.vMv != null &&
    row.iMa != null &&
    row.iMa > 0 &&
    Number.isFinite(row.vMv)
  ) {
    rapCalc = solodataRapFromField(k, row.vMv, row.spMv, row.iMa);
  }

  const nSep = row.nSep ?? Math.round(nivel);

  const dist =
    row.dist ??
    (pos ? (pos.a2 + pos.b2 + pos.m2 + pos.n2) / 4 : null);

  const rapUse =
    rapCalc != null && rapCalc > 0 ? rapCalc : row.rap;

  return {
    ...row,
    espM: row.espM ?? esp,
    esp: row.esp ?? esp,
    nivel: row.nivel ?? Math.round(nivel),
    nSep,
    g,
    k,
    rapCalc,
    a2: pos?.a2 ?? row.a2,
    b2: pos?.b2 ?? row.b2,
    m2: pos?.m2 ?? row.m2,
    n2: pos?.n2 ?? row.n2,
    dist,
    rap: rapUse,
  };
}

export function withSolodataLinhaCalculations(
  state: SolodataLinhaState,
  defaultAM: number,
): SolodataLinhaState {
  return {
    ...state,
    rows: state.rows.map((row) => computeSolodataLinhaRow(row, defaultAM)),
  };
}

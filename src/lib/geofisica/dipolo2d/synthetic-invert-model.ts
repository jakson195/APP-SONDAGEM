/**
 * Modelo invertido sintético para testar renderização (sem motor Python).
 */
import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "./types";
import { computeModelZMaxM } from "./model-depth";

export type SyntheticModelPattern = "layered" | "block" | "gradient";

export type BuildSyntheticModelOptions = {
  nx?: number;
  nz?: number;
  factorDepth?: number;
  pattern?: SyntheticModelPattern;
  /** Fundo (Ω·m). */
  rhoBackground?: number;
  /** Contraste alto (Ω·m). */
  rhoContrast?: number;
  /** Terceira unidade / base (Ω·m), padrão layered. */
  rhoBase?: number;
};

/** Extensão da malha alinhada ao motor físico (margem 8 %). */
export function meshExtentsFromReadings(
  readings: Dipolo2DReading[],
  params: Pick<Dipolo2DInvertParams, "modelDepthFactor" | "modelDepthRange">,
): { x0: number; x1: number; zMax: number } {
  if (!readings.length) {
    return { x0: 0, x1: 100, zMax: 25 };
  }
  const xs = readings.map((r) => r.stationM);
  const electrodeXs: number[] = [];
  for (const r of readings) {
    const a = r.aM;
    const n = r.n;
    const half = n * a;
    electrodeXs.push(
      r.stationM - half,
      r.stationM + half,
      r.stationM - (n - 1) * a,
      r.stationM + (n - 1) * a,
    );
  }
  const xMin = Math.min(...xs, ...electrodeXs);
  const xMax = Math.max(...xs, ...electrodeXs);
  const span = Math.max(xMax - xMin, 1);
  const margin = Math.max(0.5, span * 0.08);
  const zMax = computeModelZMaxM(readings, params);
  return { x0: xMin - margin, x1: xMax + margin, zMax };
}

function geometricZEdges(nz: number, zMax: number): Float64Array {
  const edges = new Float64Array(nz + 1);
  if (nz <= 1 || zMax <= 0) {
    edges[0] = 0;
    if (nz >= 1) edges[1] = zMax;
    return edges;
  }
  const zMin = Math.max(zMax / 2 ** nz, 0.05);
  const logRatio = Math.log(zMax / zMin);
  for (let j = 0; j <= nz; j++) {
    const t = j / nz;
    edges[j] = zMin * Math.exp(t * logRatio);
  }
  edges[0] = 0;
  return edges;
}

function rhoAtCell(
  pattern: SyntheticModelPattern,
  xCenter: number,
  zCenter: number,
  x0: number,
  x1: number,
  zMax: number,
  rhoBg: number,
  rhoHi: number,
  rhoLo: number,
): number {
  const zFrac = zMax > 0 ? zCenter / zMax : 0;
  const xMid = (x0 + x1) / 2;
  const xHalf = (x1 - x0) * 0.18;

  switch (pattern) {
    case "gradient": {
      const t = Math.max(0, Math.min(1, zFrac));
      return rhoBg * (rhoHi / rhoBg) ** t;
    }
    case "block": {
      const inBlock =
        Math.abs(xCenter - xMid) < xHalf &&
        zFrac > 0.22 &&
        zFrac < 0.78;
      return inBlock ? rhoHi : rhoBg;
    }
    case "layered":
    default:
      if (zFrac < 0.38) return rhoBg;
      if (zFrac < 0.72) return rhoHi;
      return rhoLo;
  }
}

/**
 * Gera resultado invertido falso com contraste 100–1000 Ω·m (ou customizado).
 */
export function buildSyntheticInvertResult(
  readings: Dipolo2DReading[],
  params: Pick<
    Dipolo2DInvertParams,
    "nx" | "nz" | "factorDepth" | "modelDepthFactor" | "modelDepthRange"
  >,
  options: BuildSyntheticModelOptions = {},
): Dipolo2DInvertResult {
  const nx = Math.max(8, options.nx ?? params.nx);
  const nz = Math.max(6, options.nz ?? params.nz);
  const pattern = options.pattern ?? "gradient";
  const rhoBg = options.rhoBackground ?? 100;
  const rhoHi = options.rhoContrast ?? 1000;
  const rhoLo = options.rhoBase ?? 300;

  const { x0, x1, zMax } = meshExtentsFromReadings(readings, params);
  const xEdges = Float64Array.from(
    { length: nx + 1 },
    (_, i) => x0 + (i / nx) * (x1 - x0),
  );
  const zEdges = geometricZEdges(nz, zMax);

  const mLog10 = new Float64Array(nx * nz);
  const activeCells: boolean[] = [];
  for (let i = 0; i < nx; i++) {
    const xCenter = 0.5 * (xEdges[i]! + xEdges[i + 1]!);
    for (let j = 0; j < nz; j++) {
      const zCenter = 0.5 * (zEdges[j]! + zEdges[j + 1]!);
      const rho = rhoAtCell(
        pattern,
        xCenter,
        zCenter,
        x0,
        x1,
        zMax,
        rhoBg,
        rhoHi,
        rhoLo,
      );
      mLog10[i * nz + j] = Math.log10(rho);
      activeCells.push(true);
    }
  }

  const active = readings.filter((r) => !r.excluded);
  const yObsLog10 = Float64Array.from(
    active.map((r) => Math.log10(Math.max(r.rhoApparentOhmM, 1e-6))),
  );
  const ySynLog10 = Float64Array.from(yObsLog10, (v) => v + 0.002);
  let sumSq = 0;
  for (let k = 0; k < yObsLog10.length; k++) {
    const obs = 10 ** yObsLog10[k]!;
    const syn = 10 ** ySynLog10[k]!;
    const rel = (obs - syn) / Math.max(obs, 1e-6);
    sumSq += rel * rel;
  }
  const rmsPercent =
    yObsLog10.length > 0
      ? Math.sqrt(sumSq / yObsLog10.length) * 100
      : 0.5;

  const zCoverM = Float64Array.from({ length: nx }, () => zMax);

  const patternLabel =
    pattern === "gradient"
      ? "gradiente 100→1000 Ω·m"
      : pattern === "layered"
        ? "camadas 100 / 1000 / 300 Ω·m"
        : "bloco 1000 Ω·m em fundo 100 Ω·m";

  return {
    mLog10,
    xEdgesM: xEdges,
    zEdgesM: zEdges,
    yObsLog10,
    ySynLog10,
    rmsLog10: 0.001,
    rmsPercent,
    roughnessL2: 0,
    iterations: 0,
    iterationHistory: [],
    nx,
    nz,
    methodId: "gauss_newton",
    methodLabel: `Modelo sintético (${patternLabel})`,
    physicsMessage:
      "Teste de renderização — não é saída da inversão ResIPy. Use «Limpar teste» para voltar.",
    activeCells,
    zCoverM: Array.from(zCoverM),
  };
}

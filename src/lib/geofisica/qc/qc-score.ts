import { mean, stdDev } from "./qc-filters";
import type { QcGrade } from "./qc-types";

export type QcScoreDimension =
  | "viStability"
  | "minCurrent"
  | "sp"
  | "neighborDeviation"
  | "repeatability"
  | "statisticalNoise";

export type QcScoreComponent = {
  id: QcScoreDimension;
  label: string;
  score: number;
  weight: number;
  detail?: string;
};

export type QcFieldSeries = {
  spMv: (number | null)[];
  vMv: (number | null)[];
  iMa: (number | null)[];
};

export type QcScoreContext = {
  rhoOhmM: number[];
  stationsM: number[];
  residualLogRho: number[];
  snr: number;
  spectralNoiseIndex: number;
  spikeRatio: number;
  maxAbruptChange: number;
  stabilityCv: number;
  field?: QcFieldSeries;
};

export type QcQualityScore = {
  total: number;
  grade: QcGrade;
  components: QcScoreComponent[];
};

export const QC_SCORE_WEIGHTS: Record<QcScoreDimension, number> = {
  viStability: 0.15,
  minCurrent: 0.15,
  sp: 0.1,
  neighborDeviation: 0.2,
  repeatability: 0.15,
  statisticalNoise: 0.25,
};

const MIN_CURRENT_GOOD_MA = 5;
const MIN_CURRENT_WARN_MA = 2;

export function scoreToGrade(total: number): QcGrade {
  if (total >= 70) return "green";
  if (total >= 40) return "yellow";
  return "red";
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function cvToScore(cv: number, good = 0.08, bad = 0.35): number {
  if (!Number.isFinite(cv) || cv <= good) return 100;
  if (cv >= bad) return 0;
  return clampScore(100 * (1 - (cv - good) / (bad - good)));
}

function currentScore(iMa: number): number {
  if (!(iMa > 0)) return 0;
  if (iMa >= MIN_CURRENT_GOOD_MA) return 100;
  if (iMa >= MIN_CURRENT_WARN_MA) {
    const t =
      (iMa - MIN_CURRENT_WARN_MA) /
      (MIN_CURRENT_GOOD_MA - MIN_CURRENT_WARN_MA);
    return clampScore(45 + t * 55);
  }
  return clampScore((iMa / MIN_CURRENT_WARN_MA) * 45);
}

function effectiveVi(vMv: number, spMv: number | null, iMa: number): number | null {
  if (!(iMa > 0) || !Number.isFinite(vMv)) return null;
  return Math.abs(vMv - (spMv ?? 0)) / iMa;
}

function scoreViStability(ctx: QcScoreContext): QcScoreComponent {
  const field = ctx.field;
  if (field) {
    const ratios: number[] = [];
    for (let i = 0; i < ctx.rhoOhmM.length; i++) {
      const v = field.vMv[i];
      const sp = field.spMv[i];
      const iMa = field.iMa[i];
      if (v == null || iMa == null || !(iMa > 0)) continue;
      const r = effectiveVi(v, sp, iMa);
      if (r != null && r > 0) ratios.push(r);
    }
    if (ratios.length >= 2) {
      const cv = coefficientOfVariation(ratios);
      return {
        id: "viStability",
        label: "Estabilidade V/I",
        score: cvToScore(cv, 0.06, 0.28),
        weight: QC_SCORE_WEIGHTS.viStability,
        detail: `CV(V/I)=${(cv * 100).toFixed(1)}%`,
      };
    }
  }
  return {
    id: "viStability",
    label: "Estabilidade V/I",
    score: cvToScore(ctx.stabilityCv, 0.1, 0.45),
    weight: QC_SCORE_WEIGHTS.viStability,
    detail: "Proxy via CV de ρa (sem V/I em campo)",
  };
}

function scoreMinCurrent(ctx: QcScoreContext): QcScoreComponent {
  const field = ctx.field;
  if (field) {
    const scores: number[] = [];
    let minI = Infinity;
    for (let i = 0; i < ctx.rhoOhmM.length; i++) {
      const iMa = field.iMa[i];
      if (iMa == null || !(iMa > 0)) continue;
      minI = Math.min(minI, iMa);
      scores.push(currentScore(iMa));
    }
    if (scores.length > 0) {
      return {
        id: "minCurrent",
        label: "Corrente mínima",
        score: clampScore(mean(scores)),
        weight: QC_SCORE_WEIGHTS.minCurrent,
        detail: `i mín. ${Number.isFinite(minI) ? minI.toFixed(2) : "—"} mA`,
      };
    }
  }
  return {
    id: "minCurrent",
    label: "Corrente mínima",
    score: 55,
    weight: QC_SCORE_WEIGHTS.minCurrent,
    detail: "Sem corrente (i) registada",
  };
}

function scoreSp(ctx: QcScoreContext): QcScoreComponent {
  const field = ctx.field;
  if (!field) {
    return {
      id: "sp",
      label: "SP",
      score: 60,
      weight: QC_SCORE_WEIGHTS.sp,
      detail: "Sem SP registado",
    };
  }

  const spVals: number[] = [];
  const ratios: number[] = [];
  for (let i = 0; i < ctx.rhoOhmM.length; i++) {
    const sp = field.spMv[i];
    const v = field.vMv[i];
    if (sp != null && Number.isFinite(sp)) spVals.push(Math.abs(sp));
    if (sp != null && v != null && Math.abs(v) > 0.05) {
      ratios.push(Math.abs(sp) / Math.abs(v));
    }
  }

  if (spVals.length === 0) {
    return {
      id: "sp",
      label: "SP",
      score: 70,
      weight: QC_SCORE_WEIGHTS.sp,
      detail: "SP nulo ou ausente",
    };
  }

  const cv = coefficientOfVariation(spVals);
  const maxRatio = ratios.length > 0 ? Math.max(...ratios) : 0;
  const stability = cvToScore(cv, 0.12, 0.55);
  const magnitude =
    maxRatio <= 0.15 ? 100 : maxRatio >= 0.6 ? 0 : clampScore(100 * (1 - (maxRatio - 0.15) / 0.45));

  return {
    id: "sp",
    label: "SP",
    score: clampScore(stability * 0.55 + magnitude * 0.45),
    weight: QC_SCORE_WEIGHTS.sp,
    detail: `|SP/V| máx ${(maxRatio * 100).toFixed(0)}% · CV ${(cv * 100).toFixed(0)}%`,
  };
}

function scoreNeighborDeviation(ctx: QcScoreContext): QcScoreComponent {
  const res = ctx.residualLogRho;
  if (res.length === 0) {
    return {
      id: "neighborDeviation",
      label: "Desvio vizinhos",
      score: 50,
      weight: QC_SCORE_WEIGHTS.neighborDeviation,
    };
  }
  const sd = stdDev(res);
  const pointScores = res.map((r) => {
    const z = sd > 1e-9 ? Math.abs(r) / sd : 0;
    return clampScore(100 - z * 28);
  });
  return {
    id: "neighborDeviation",
    label: "Desvio vizinhos",
    score: clampScore(mean(pointScores)),
    weight: QC_SCORE_WEIGHTS.neighborDeviation,
    detail: `Resíduo log ρ (σ=${sd.toFixed(3)})`,
  };
}

function scoreRepeatability(ctx: QcScoreContext): QcScoreComponent {
  const { rhoOhmM, stationsM, spikeRatio, maxAbruptChange } = ctx;
  const smoothScore = clampScore(100 * (1 - Math.min(maxAbruptChange / 0.45, 1)));
  const spikeScore = clampScore(100 * (1 - spikeRatio * 2.5));

  let duplicateScore = 100;
  const dupPairs: number[] = [];
  for (let i = 0; i < rhoOhmM.length; i++) {
    for (let j = i + 1; j < rhoOhmM.length; j++) {
      if (Math.abs(stationsM[i]! - stationsM[j]!) > 0.5) continue;
      const r1 = rhoOhmM[i]!;
      const r2 = rhoOhmM[j]!;
      const rel = Math.abs(r1 - r2) / Math.max(r1, r2, 1);
      dupPairs.push(rel);
    }
  }
  if (dupPairs.length > 0) {
    const meanRel = mean(dupPairs);
    duplicateScore = clampScore(100 * (1 - Math.min(meanRel / 0.25, 1)));
  }

  const score = clampScore(smoothScore * 0.4 + spikeScore * 0.35 + duplicateScore * 0.25);
  return {
    id: "repeatability",
    label: "Repetibilidade",
    score,
    weight: QC_SCORE_WEIGHTS.repeatability,
    detail:
      dupPairs.length > 0
        ? `Δρ rel. médio ${(mean(dupPairs) * 100).toFixed(0)}% em estações repetidas`
        : `Var. máx ${maxAbruptChange.toFixed(2)} log ρ`,
  };
}

function scoreStatisticalNoise(ctx: QcScoreContext): QcScoreComponent {
  const snr = ctx.snr;
  let snrScore: number;
  if (snr >= 10) snrScore = 100;
  else if (snr >= 4) snrScore = clampScore(40 + ((snr - 4) / 6) * 60);
  else snrScore = clampScore((snr / 4) * 40);

  const spectralScore = clampScore(100 * (1 - Math.min(ctx.spectralNoiseIndex, 1)));
  const score = clampScore(snrScore * 0.72 + spectralScore * 0.28);

  return {
    id: "statisticalNoise",
    label: "Ruído estatístico",
    score,
    weight: QC_SCORE_WEIGHTS.statisticalNoise,
    detail: `SNR ${snr.toFixed(1)} · espectral ${(ctx.spectralNoiseIndex * 100).toFixed(0)}%`,
  };
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  if (Math.abs(m) < 1e-12) return 0;
  return stdDev(values) / Math.abs(m);
}

export function computeLineQualityScore(ctx: QcScoreContext): QcQualityScore {
  const components: QcScoreComponent[] = [
    scoreViStability(ctx),
    scoreMinCurrent(ctx),
    scoreSp(ctx),
    scoreNeighborDeviation(ctx),
    scoreRepeatability(ctx),
    scoreStatisticalNoise(ctx),
  ];

  const total = clampScore(
    components.reduce((acc, c) => acc + c.score * c.weight, 0),
  );

  return {
    total,
    grade: scoreToGrade(total),
    components,
  };
}

export type ReadingScoreInput = {
  index: number;
  rhoOhmM: number;
  residual: number;
  isSpike: boolean;
  localSnr: number;
  spMv?: number | null;
  vMv?: number | null;
  iMa?: number | null;
  lineViMedian?: number | null;
  neighborRhos?: number[];
};

export function computeReadingQualityScore(input: ReadingScoreInput): number {
  if (input.isSpike) return 15;

  const sd = input.neighborRhos && input.neighborRhos.length >= 2
    ? stdDev(input.neighborRhos.map((r) => Math.log10(Math.max(r, 1e-6))))
    : 0.15;
  const z = sd > 1e-9 ? Math.abs(input.residual) / sd : 0;
  const neighbor = clampScore(100 - z * 30);

  let vi = 70;
  if (
    input.vMv != null &&
    input.iMa != null &&
    input.iMa > 0 &&
    input.lineViMedian != null &&
    input.lineViMedian > 0
  ) {
    const r = effectiveVi(input.vMv, input.spMv ?? null, input.iMa);
    if (r != null) {
      const rel = Math.abs(r - input.lineViMedian) / input.lineViMedian;
      vi = clampScore(100 * (1 - Math.min(rel / 0.35, 1)));
    }
  }

  const current =
    input.iMa != null && input.iMa > 0 ? currentScore(input.iMa) : 55;

  let sp = 70;
  if (input.spMv != null && input.vMv != null && Math.abs(input.vMv) > 0.05) {
    const ratio = Math.abs(input.spMv) / Math.abs(input.vMv);
    sp = ratio <= 0.15 ? 100 : ratio >= 0.6 ? 20 : clampScore(100 * (1 - (ratio - 0.15) / 0.45));
  }

  let repeat = 80;
  if (input.neighborRhos && input.neighborRhos.length >= 2) {
    const logR = input.neighborRhos.map((r) => Math.log10(Math.max(r, 1e-6)));
    const localMean = mean(logR);
    const logSelf = Math.log10(Math.max(input.rhoOhmM, 1e-6));
    const rel = Math.abs(logSelf - localMean);
    repeat = clampScore(100 * (1 - Math.min(rel / 0.25, 1)));
  }

  const snr = input.localSnr;
  const noise =
    snr >= 10 ? 100 : snr >= 4 ? clampScore(40 + ((snr - 4) / 6) * 60) : clampScore((snr / 4) * 40);

  return clampScore(
    vi * QC_SCORE_WEIGHTS.viStability +
      current * QC_SCORE_WEIGHTS.minCurrent +
      sp * QC_SCORE_WEIGHTS.sp +
      neighbor * QC_SCORE_WEIGHTS.neighborDeviation +
      repeat * QC_SCORE_WEIGHTS.repeatability +
      noise * QC_SCORE_WEIGHTS.statisticalNoise,
  );
}

export function formatScoreComponents(components: QcScoreComponent[]): string {
  return components
    .map((c) => `${c.label} ${c.score.toFixed(0)}`)
    .join(" · ");
}

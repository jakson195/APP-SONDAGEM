import type { Dipolo2DReading } from "../dipolo2d/types";
import {
  lowPassFilter1d,
  mean,
  medianFilter1d,
  stdDev,
} from "./qc-filters";
import {
  powerLineNoiseFromTimeSeries,
  spatialSpectralNoiseIndex,
} from "./qc-fft";
import {
  coefficientOfVariation,
  detectSpikes,
  maxAbruptChange,
} from "./qc-spikes";
import {
  computeLineQualityScore,
  computeReadingQualityScore,
  scoreToGrade,
} from "./qc-score";
import type {
  LineQcMetrics,
  QcAnalyzeInput,
  QcGrade,
  QcGradeThresholds,
  ReadingQcPoint,
  SurveyQcReport,
} from "./qc-types";
import { DEFAULT_QC_THRESHOLDS } from "./qc-types";

function computeSnr(signal: number[], noise: number[]): number {
  const ps = signal.reduce((a, v) => a + v * v, 0) / Math.max(1, signal.length);
  const pn = noise.reduce((a, v) => a + v * v, 0) / Math.max(1, noise.length);
  if (pn < 1e-14) return 99;
  return Math.sqrt(ps / pn);
}

export function analyzeLineQc(
  input: QcAnalyzeInput,
  _thresholds: QcGradeThresholds = DEFAULT_QC_THRESHOLDS,
): LineQcMetrics {
  const { stationsM, rhoOhmM } = input;
  const n = rhoOhmM.length;

  if (n === 0) {
    return emptyLineQc(input.lineId, input.lineName);
  }

  const logRho = rhoOhmM.map((r) => Math.log10(Math.max(r, 1e-6)));
  const smooth = medianFilter1d(logRho, 5);
  const lowPass = lowPassFilter1d(logRho, 0.25);
  const signal = lowPass;
  const residual = logRho.map((v, i) => v - smooth[i]!);

  const snr = computeSnr(signal, residual);

  const { indices: spikeIndices, mask: spikeMask } = detectSpikes(residual, 2.8);
  const abrupt = maxAbruptChange(logRho);
  const cv = coefficientOfVariation(rhoOhmM);

  const { index: spectralNoiseIndex, peaks } = spatialSpectralNoiseIndex(
    stationsM,
    logRho,
  );

  let powerLine50 = 0;
  let powerLine60 = 0;
  if (input.timeSeries && input.sampleRateHz) {
    const pl = powerLineNoiseFromTimeSeries(
      input.timeSeries,
      input.sampleRateHz,
    );
    powerLine50 = pl.p50;
    powerLine60 = pl.p60;
  }

  const lineViMedian = medianEffectiveVi(input.field);

  const localWindow = Math.max(3, Math.min(7, Math.floor(n / 6) | 1));
  const readingPoints: ReadingQcPoint[] = logRho.map((_, i) => {
    const lo = Math.max(0, i - localWindow);
    const hi = Math.min(n, i + localWindow + 1);
    const locRes = residual.slice(lo, hi);
    const locSnr = computeSnr(
      signal.slice(lo, hi),
      locRes.length ? locRes : [0],
    );
    const neighborRhos = rhoOhmM.slice(lo, hi);
    const field = input.field;
    const qualityScore = computeReadingQualityScore({
      index: i,
      rhoOhmM: rhoOhmM[i]!,
      residual: residual[i]!,
      isSpike: spikeMask[i] ?? false,
      localSnr: locSnr,
      spMv: field?.spMv[i],
      vMv: field?.vMv[i],
      iMa: field?.iMa[i],
      lineViMedian,
      neighborRhos,
    });
    const ptGrade = spikeMask[i] ? "red" : scoreToGrade(qualityScore);
    return {
      index: i,
      stationM: stationsM[i] ?? i,
      rhoOhmM: rhoOhmM[i]!,
      grade: ptGrade,
      isSpike: spikeMask[i] ?? false,
      residual: residual[i]!,
      qualityScore,
    };
  });

  const quality = computeLineQualityScore({
    rhoOhmM,
    stationsM,
    residualLogRho: residual,
    snr,
    spectralNoiseIndex,
    spikeRatio: spikeIndices.length / n,
    maxAbruptChange: abrupt,
    stabilityCv: cv,
    field: input.field,
  });

  const grade = quality.grade;
  const summary = buildLineSummary(grade, quality.total, snr, spikeIndices.length, n);

  return {
    lineId: input.lineId,
    lineName: input.lineName,
    grade,
    snr,
    qualityScore: quality.total,
    scoreComponents: quality.components,
    amplitudeMean: mean(rhoOhmM),
    amplitudeStd: stdDev(rhoOhmM),
    amplitudeMin: Math.min(...rhoOhmM),
    amplitudeMax: Math.max(...rhoOhmM),
    spikeCount: spikeIndices.length,
    spikeRatio: spikeIndices.length / n,
    maxAbruptChange: abrupt,
    stabilityCv: cv,
    powerLine50,
    powerLine60,
    spectralNoiseIndex,
    spectralPeaks: peaks,
    readingPoints,
    filteredLogRho: smooth,
    residualLogRho: residual,
    stationsM: [...stationsM],
    summary,
  };
}

function buildLineSummary(
  grade: QcGrade,
  qualityScore: number,
  snr: number,
  spikes: number,
  n: number,
): string {
  const g =
    grade === "green"
      ? "confiável"
      : grade === "yellow"
        ? "atenção"
        : "provável ruído";
  return `Qualidade ${g} (score ${qualityScore.toFixed(0)}/100, SNR≈${snr.toFixed(1)}). ${spikes}/${n} spikes.`;
}

function medianEffectiveVi(
  field: QcAnalyzeInput["field"],
): number | null {
  if (!field) return null;
  const vals: number[] = [];
  for (let i = 0; i < field.iMa.length; i++) {
    const v = field.vMv[i];
    const sp = field.spMv[i];
    const iMa = field.iMa[i];
    if (v == null || iMa == null || !(iMa > 0)) continue;
    vals.push(Math.abs(v - (sp ?? 0)) / iMa);
  }
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)]!;
}

function emptyLineQc(lineId: string, lineName: string): LineQcMetrics {
  return {
    lineId,
    lineName,
    grade: "red",
    snr: 0,
    qualityScore: 0,
    scoreComponents: [],
    amplitudeMean: 0,
    amplitudeStd: 0,
    amplitudeMin: 0,
    amplitudeMax: 0,
    spikeCount: 0,
    spikeRatio: 0,
    maxAbruptChange: 0,
    stabilityCv: 0,
    powerLine50: 0,
    powerLine60: 0,
    spectralNoiseIndex: 0,
    spectralPeaks: [],
    readingPoints: [],
    filteredLogRho: [],
    residualLogRho: [],
    stationsM: [],
    summary: "Sem leituras para análise QC.",
  };
}

export function spatialCoherence(lines: LineQcMetrics[]): number {
  if (lines.length < 2) return 1;
  const profiles = lines
    .filter((l) => l.filteredLogRho.length >= 4)
    .map((l) => l.filteredLogRho);
  if (profiles.length < 2) return 0.5;

  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      sum += pearsonCorrelation(profiles[i]!, profiles[j]!);
      pairs++;
    }
  }
  const r = pairs > 0 ? sum / pairs : 0;
  return Math.max(0, Math.min(1, (r + 1) / 2));
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const mx = mean(a.slice(0, n));
  const my = mean(b.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = a[i]! - mx;
    const vy = b[i]! - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

export function analyzeSurveyQc(
  inputs: QcAnalyzeInput[],
  thresholds?: QcGradeThresholds,
): SurveyQcReport {
  const lines = inputs.map((inp) => analyzeLineQc(inp, thresholds));
  const coherence = spatialCoherence(lines);
  const overallSnr =
    lines.length > 0
      ? lines.reduce((a, l) => a + l.snr, 0) / lines.length
      : 0;
  const overallQualityScore =
    lines.length > 0
      ? lines.reduce((a, l) => a + l.qualityScore, 0) / lines.length
      : 0;
  const worst = lines.some((l) => l.grade === "red")
    ? "red"
    : lines.some((l) => l.grade === "yellow")
      ? "yellow"
      : "green";

  return {
    lines,
    spatialCoherence: coherence,
    overallGrade: worst,
    overallSnr,
    overallQualityScore,
    analyzedAt: new Date().toISOString(),
  };
}

export function readingsToQcInput(
  lineId: string,
  lineName: string,
  readings: Dipolo2DReading[],
): QcAnalyzeInput {
  const active = readings.filter((r) => !r.excluded && r.rhoApparentOhmM > 0);
  const sorted = [...active].sort((a, b) => a.stationM - b.stationM);
  const hasField = sorted.some(
    (r) => r.spMv != null || r.vMv != null || r.iMa != null,
  );
  return {
    lineId,
    lineName,
    stationsM: sorted.map((r) => r.stationM),
    rhoOhmM: sorted.map((r) => r.rhoApparentOhmM),
    field: hasField
      ? {
          spMv: sorted.map((r) => r.spMv ?? null),
          vMv: sorted.map((r) => r.vMv ?? null),
          iMa: sorted.map((r) => r.iMa ?? null),
        }
      : undefined,
  };
}

import type { QcQualityScore, QcScoreComponent } from "./qc-score";

/** Classificação automática de qualidade geofísica. */
export type QcGrade = "green" | "yellow" | "red";

export type { QcQualityScore, QcScoreComponent };

export type QcGradeThresholds = {
  greenMinSnr: number;
  yellowMinSnr: number;
};

export const DEFAULT_QC_THRESHOLDS: QcGradeThresholds = {
  greenMinSnr: 10,
  yellowMinSnr: 4,
};

export function snrToGrade(
  snr: number,
  thresholds: QcGradeThresholds = DEFAULT_QC_THRESHOLDS,
): QcGrade {
  if (snr > thresholds.greenMinSnr) return "green";
  if (snr >= thresholds.yellowMinSnr) return "yellow";
  return "red";
}

export const QC_GRADE_COLORS: Record<
  QcGrade,
  { hex: string; label: string; bg: string }
> = {
  green: {
    hex: "#22c55e",
    label: "Confiável",
    bg: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
  },
  yellow: {
    hex: "#eab308",
    label: "Atenção",
    bg: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100",
  },
  red: {
    hex: "#ef4444",
    label: "Provável ruído",
    bg: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  },
};

export type SpectralPeak = {
  /** Frequência espacial ou Hz. */
  freq: number;
  power: number;
  label?: string;
};

export type ReadingQcPoint = {
  index: number;
  stationM: number;
  rhoOhmM: number;
  grade: QcGrade;
  isSpike: boolean;
  residual: number;
  /** Score composto 0–100 (leitura). */
  qualityScore: number;
};

export type LineQcMetrics = {
  lineId: string;
  lineName: string;
  grade: QcGrade;
  snr: number;
  /** Score composto 0–100 (linha). */
  qualityScore: number;
  scoreComponents: QcScoreComponent[];
  amplitudeMean: number;
  amplitudeStd: number;
  amplitudeMin: number;
  amplitudeMax: number;
  spikeCount: number;
  spikeRatio: number;
  maxAbruptChange: number;
  stabilityCv: number;
  /** Energia relativa 50 Hz (0–1) se série temporal disponível. */
  powerLine50: number;
  /** Energia relativa 60 Hz (0–1). */
  powerLine60: number;
  spectralNoiseIndex: number;
  spectralPeaks: SpectralPeak[];
  readingPoints: ReadingQcPoint[];
  filteredLogRho: number[];
  residualLogRho: number[];
  stationsM: number[];
  summary: string;
};

export type SurveyQcReport = {
  lines: LineQcMetrics[];
  spatialCoherence: number;
  overallGrade: QcGrade;
  overallSnr: number;
  /** Score composto médio da campanha (0–100). */
  overallQualityScore: number;
  analyzedAt: string;
};

export type QcFieldInput = {
  spMv: (number | null)[];
  vMv: (number | null)[];
  iMa: (number | null)[];
};

export type QcAnalyzeInput = {
  lineId: string;
  lineName: string;
  stationsM: number[];
  rhoOhmM: number[];
  /** SP, V, i por leitura (mesma ordem que ρa). */
  field?: QcFieldInput;
  /** Taxa de amostragem (Hz) — opcional, para ruído 50/60 Hz em V/I. */
  sampleRateHz?: number;
  /** Série temporal bruta (mV) — opcional. */
  timeSeries?: number[];
};

import { stdDev } from "./qc-filters";

/** Detecção de spikes por z-score na série de resíduos. */
export function detectSpikes(
  values: number[],
  zThreshold = 3,
): { indices: number[]; mask: boolean[] } {
  const sd = stdDev(values);
  const m =
    values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
  const mask = values.map((v) => {
    if (sd < 1e-12) return false;
    return Math.abs(v - m) / sd > zThreshold;
  });
  const indices: number[] = [];
  mask.forEach((is, i) => {
    if (is) indices.push(i);
  });
  return { indices, mask };
}

export function maxAbruptChange(values: number[]): number {
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    max = Math.max(max, Math.abs(values[i]! - values[i - 1]!));
  }
  return max;
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  if (Math.abs(m) < 1e-12) return 0;
  return stdDev(values) / Math.abs(m);
}

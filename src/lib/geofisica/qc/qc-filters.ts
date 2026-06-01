/** Filtros 1D para QC geofísico. */

export function medianFilter1d(values: number[], window = 5): number[] {
  const w = Math.max(3, window | 1);
  const half = (w - 1) >> 1;
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const slice: number[] = [];
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < values.length) slice.push(values[k]!);
    }
    slice.sort((a, b) => a - b);
    out[i] = slice[(slice.length - 1) >> 1]!;
  }
  return out;
}

/** Passa-baixa Butterworth simplificado (1ª ordem, cascata forward-backward). */
export function lowPassFilter1d(
  values: number[],
  cutoffNorm: number,
): number[] {
  if (values.length < 3) return [...values];
  const alpha = Math.max(0.01, Math.min(0.99, cutoffNorm));
  const forward: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    forward[i] = alpha * forward[i - 1]! + (1 - alpha) * values[i]!;
  }
  const backward: number[] = new Array(values.length);
  backward[values.length - 1] = forward[values.length - 1]!;
  for (let i = values.length - 2; i >= 0; i--) {
    backward[i] = alpha * backward[i + 1]! + (1 - alpha) * forward[i]!;
  }
  return backward;
}

export function interpolateUniformGrid(
  x: number[],
  y: number[],
  count: number,
): { xu: number[]; yu: number[] } {
  if (x.length === 0) return { xu: [], yu: [] };
  if (x.length === 1) {
    return { xu: [x[0]!], yu: [y[0]!] };
  }
  const x0 = x[0]!;
  const x1 = x[x.length - 1]!;
  const xu: number[] = [];
  const yu: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const xi = x0 + t * (x1 - x0);
    xu.push(xi);
    let j = 0;
    while (j < x.length - 1 && x[j + 1]! < xi) j++;
    const xA = x[j]!;
    const xB = x[Math.min(j + 1, x.length - 1)]!;
    const yA = y[j]!;
    const yB = y[Math.min(j + 1, y.length - 1)]!;
    const u = xB > xA ? (xi - xA) / (xB - xA) : 0;
    yu.push(yA + u * (yB - yA));
  }
  return { xu, yu };
}

export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return Math.sqrt(s / values.length);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

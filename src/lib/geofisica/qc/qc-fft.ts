import type { SpectralPeak } from "./qc-types";

/** FFT radix-2 Cooley-Tukey (potência de 2). */
export function fftReal(signal: number[]): { re: Float64Array; im: Float64Array } {
  const n = nextPow2(signal.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < signal.length; i++) re[i] = signal[i]!;
  fftInPlace(re, im);
  return { re, im };
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * wRe - im[i + k + len / 2]! * wIm;
        const vIm = re[i + k + len / 2]! * wIm + im[i + k + len / 2]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
}

export function powerSpectrum(
  signal: number[],
  sampleRate: number,
): { freqs: number[]; power: number[] } {
  const { re, im } = fftReal(signal);
  const n = re.length;
  const half = (n / 2) | 0;
  const freqs: number[] = [];
  const power: number[] = [];
  for (let k = 0; k <= half; k++) {
    freqs.push((k * sampleRate) / n);
    power.push((re[k]! ** 2 + im[k]! ** 2) / n);
  }
  return { freqs, power };
}

/** Energia relativa numa banda de frequência (Hz). */
export function bandPowerRatio(
  freqs: number[],
  power: number[],
  fLow: number,
  fHigh: number,
): number {
  let band = 0;
  let total = 0;
  for (let i = 0; i < freqs.length; i++) {
    const p = power[i]!;
    total += p;
    if (freqs[i]! >= fLow && freqs[i]! <= fHigh) band += p;
  }
  return total > 0 ? band / total : 0;
}

export function spectralPeaks(
  freqs: number[],
  power: number[],
  maxPeaks = 5,
  minFreq = 0.01,
): SpectralPeak[] {
  const peaks: SpectralPeak[] = [];
  for (let i = 1; i < power.length - 1; i++) {
    if (freqs[i]! < minFreq) continue;
    if (power[i]! > power[i - 1]! && power[i]! > power[i + 1]!) {
      peaks.push({ freq: freqs[i]!, power: power[i]! });
    }
  }
  peaks.sort((a, b) => b.power - a.power);
  return peaks.slice(0, maxPeaks);
}

/** Índice de ruído espectral (alta freq / total) em perfil ρa. */
export function spatialSpectralNoiseIndex(
  stationsM: number[],
  logRho: number[],
): { index: number; peaks: SpectralPeak[] } {
  if (logRho.length < 8) {
    return { index: 0, peaks: [] };
  }
  const n = logRho.length;
  const mean =
    logRho.reduce((a, b) => a + b, 0) / Math.max(1, logRho.length);
  const centered = logRho.map((v) => v - mean);
  const dx =
    stationsM.length > 1
      ? (stationsM[stationsM.length - 1]! - stationsM[0]!) /
        (stationsM.length - 1)
      : 1;
  const sampleRate = dx > 0 ? 1 / dx : 1;
  const { freqs, power } = powerSpectrum(centered, sampleRate);
  const total = power.reduce((a, b) => a + b, 0);
  const mid = freqs.length > 2 ? Math.floor(freqs.length * 0.35) : 1;
  let high = 0;
  for (let i = mid; i < power.length; i++) high += power[i]!;
  const index = total > 0 ? high / total : 0;
  return {
    index,
    peaks: spectralPeaks(freqs, power, 4).map((p) => ({
      ...p,
      label: `${p.freq.toFixed(3)} c/m`,
    })),
  };
}

export function powerLineNoiseFromTimeSeries(
  timeSeries: number[],
  sampleRateHz: number,
): { p50: number; p60: number } {
  if (timeSeries.length < 16 || sampleRateHz <= 0) {
    return { p50: 0, p60: 0 };
  }
  const mean = timeSeries.reduce((a, b) => a + b, 0) / timeSeries.length;
  const centered = timeSeries.map((v) => v - mean);
  const { freqs, power } = powerSpectrum(centered, sampleRateHz);
  return {
    p50: bandPowerRatio(freqs, power, 48, 52),
    p60: bandPowerRatio(freqs, power, 58, 62),
  };
}

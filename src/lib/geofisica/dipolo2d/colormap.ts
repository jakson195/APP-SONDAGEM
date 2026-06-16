export type ResistivityPalette =
  | "default"
  | "rainbow"
  | "jet"
  | "viridis"
  | "turbo"
  | "seismic"
  | "grayscale"
  | "x2ipi";

export type ResistivityColorScale = {
  auto: boolean;
  /** Limites em Ω·m (escala log₁₀ interna). */
  rhoMinOhmM: number | null;
  rhoMaxOhmM: number | null;
  palette: ResistivityPalette;
};

export const defaultColorScale: ResistivityColorScale = {
  auto: true,
  rhoMinOhmM: null,
  rhoMaxOhmM: null,
  palette: "x2ipi",
};

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Paleta estilo x2ipi / RES2DINV (roxo → azul → verde → amarelo → vermelho). */
function x2ipiColor(t: number): [number, number, number] {
  const x = clamp01(t);
  const stops: [number, number, number, number][] = [
    [0, 80, 0, 160],
    [0.2, 0, 180, 255],
    [0.45, 0, 220, 120],
    [0.65, 255, 255, 0],
    [0.85, 255, 140, 0],
    [1, 220, 40, 40],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (x >= a[0] && x <= b[0]) {
      const u = (x - a[0]) / (b[0] - a[0] || 1);
      return [
        lerp(a[1], b[1], u),
        lerp(a[2], b[2], u),
        lerp(a[3], b[3], u),
      ];
    }
  }
  const last = stops[stops.length - 1]!;
  return [last[1], last[2], last[3]];
}

function jetColor(t: number): [number, number, number] {
  const x = clamp01(t);
  const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 3)));
  const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 2)));
  const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 1)));
  return [(r * 255) | 0, (g * 255) | 0, (b * 255) | 0];
}

function rainbowColor(t: number): [number, number, number] {
  const x = clamp01(t) * 5;
  const i = Math.floor(x);
  const f = x - i;
  const v = (1 - f) * 255;
  const w = f * 255;
  switch (i % 6) {
    case 0:
      return [255, w, 0];
    case 1:
      return [v, 255, 0];
    case 2:
      return [0, 255, w];
    case 3:
      return [0, v, 255];
    case 4:
      return [w, 0, 255];
    default:
      return [255, 0, v];
  }
}

function viridisColor(t: number): [number, number, number] {
  const x = clamp01(t);
  const r = Math.round(255 * (0.267 + 0.005 * x + 0.322 * x * x + 0.406 * x * x * x));
  const g = Math.round(255 * (0.004 + 0.99 * x - 0.357 * x * x));
  const b = Math.round(255 * (0.329 + 0.671 * x - 0.865 * x * x + 0.865 * x * x * x));
  return [r, g, b];
}

function turboColor(t: number): [number, number, number] {
  const x = clamp01(t);
  const r = Math.round(255 * (0.19 + 2.3 * x - 2.1 * x * x));
  const g = Math.round(255 * (0.02 + 1.8 * x - 1.2 * x * x + 0.4 * x * x * x));
  const b = Math.round(255 * (0.53 - 1.6 * x + 1.1 * x * x));
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

function seismicColor(t: number): [number, number, number] {
  const x = clamp01(t);
  if (x < 0.5) {
    const u = x * 2;
    return [(u * 80) | 0, (u * 80) | 0, (180 + u * 75) | 0];
  }
  const u = (x - 0.5) * 2;
  return [(200 + u * 55) | 0, (80 - u * 80) | 0, (80 - u * 80) | 0];
}

function defaultColor(t: number): [number, number, number] {
  const x = clamp01(t);
  if (x < 0.25) {
    const u = x / 0.25;
    return [20 + 40 * u, 30 + 100 * u, 120 + 135 * u];
  }
  if (x < 0.5) {
    const u = (x - 0.25) / 0.25;
    return [60 + 80 * u, 130 + 100 * u, 255 - 55 * u];
  }
  if (x < 0.75) {
    const u = (x - 0.5) / 0.25;
    return [140 + 80 * u, 230 - 30 * u, 200 - 100 * u];
  }
  const u = (x - 0.75) / 0.25;
  return [220 + 35 * u, 200 - 50 * u, 100 - 40 * u];
}

export function paletteColor(
  palette: ResistivityPalette,
  t: number,
): [number, number, number] {
  switch (palette) {
    case "rainbow":
      return rainbowColor(t);
    case "jet":
      return jetColor(t);
    case "viridis":
      return viridisColor(t);
    case "turbo":
      return turboColor(t);
    case "seismic":
      return seismicColor(t);
    case "grayscale": {
      const g = (clamp01(t) * 255) | 0;
      return [g, g, g];
    }
    case "x2ipi":
      return x2ipiColor(t);
    default:
      return defaultColor(t);
  }
}

export function resolveLogBounds(
  valuesOhmM: number[],
  scale: ResistivityColorScale,
): { logLo: number; logHi: number } {
  const logs = valuesOhmM
    .filter((v) => v > 0 && Number.isFinite(v))
    .map((v) => Math.log10(v));
  let logLo = logs.length ? Math.min(...logs) : 0;
  let logHi = logs.length ? Math.max(...logs) : 1;
  if (!(logHi > logLo)) {
    logLo -= 0.1;
    logHi += 0.1;
  }
  if (!scale.auto) {
    if (scale.rhoMinOhmM != null && scale.rhoMinOhmM > 0) {
      logLo = Math.log10(scale.rhoMinOhmM);
    }
    if (scale.rhoMaxOhmM != null && scale.rhoMaxOhmM > 0) {
      logHi = Math.log10(scale.rhoMaxOhmM);
    }
  }
  if (!(logHi > logLo)) logHi = logLo + 0.1;
  return { logLo, logHi };
}

/** Aplica escala manual quando os limites já estão em log₁₀(ρ). */
export function applyLogBoundsScale(
  logLo: number,
  logHi: number,
  scale: ResistivityColorScale,
): { logLo: number; logHi: number } {
  let lo = logLo;
  let hi = logHi;
  if (!(hi > lo)) {
    lo -= 0.1;
    hi += 0.1;
  }
  if (!scale.auto) {
    if (scale.rhoMinOhmM != null && scale.rhoMinOhmM > 0) {
      lo = Math.log10(scale.rhoMinOhmM);
    }
    if (scale.rhoMaxOhmM != null && scale.rhoMaxOhmM > 0) {
      hi = Math.log10(scale.rhoMaxOhmM);
    }
  }
  if (!(hi > lo)) hi = lo + 0.1;
  return { logLo: lo, logHi: hi };
}

/**
 * Normalização logarítmica (equivalente a matplotlib.colors.LogNorm em log₁₀).
 * ρ_display = (log₁₀ ρ − logLo) / (logHi − logLo).
 */
export function rhoToNormalized(
  rhoOhmM: number,
  logLo: number,
  logHi: number,
): number {
  const logV = Math.log10(Math.max(1e-12, rhoOhmM));
  return clamp01((logV - logLo) / (logHi - logLo || 1));
}

/** Limites LogNorm a partir de valores em Ω·m (percentis opcionais). */
export function logNormBoundsFromRho(
  rhoValues: number[],
  pLo = 0.02,
  pHi = 0.98,
): { logLo: number; logHi: number } {
  const logs = rhoValues
    .filter((v) => v > 0 && Number.isFinite(v))
    .map((v) => Math.log10(v))
    .sort((a, b) => a - b);
  if (!logs.length) return { logLo: 1, logHi: 3 };
  const iLo = Math.max(0, Math.floor(logs.length * pLo));
  const iHi = Math.min(logs.length - 1, Math.floor(logs.length * pHi));
  let logLo = logs[iLo]!;
  let logHi = logs[iHi]!;
  if (!(logHi > logLo)) logHi = logLo + 0.15;
  return { logLo, logHi };
}

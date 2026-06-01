import type { SpectralIndex } from "./temporal-types";

/** Bandas típicas Sentinel-2 / Landsat (reflectância 0–1 ou DN normalizado). */
export type MultispectralBands = {
  blue: number;
  green: number;
  red: number;
  nir: number;
  swir1?: number;
  swir2?: number;
};

function safeRatio(a: number, b: number): number {
  const d = a + b;
  if (Math.abs(d) < 1e-6) return 0;
  return (a - b) / d;
}

/** Bandas sintéticas por posição normalizada (0–1) e ano — demo temporal. */
export function buildSyntheticBandsAt(
  u: number,
  v: number,
  seed: number,
  year = 2000,
): MultispectralBands {
  const yearNorm = Math.max(0, Math.min(1, (year - 1970) / 50));
  const drift = yearNorm * 0.35;
  return {
    blue: 0.1 + 0.05 * Math.sin(u * 6 + seed) - drift * 0.15,
    green:
      0.15 +
      0.08 * Math.cos(v * 5 + seed * 0.3) +
      drift * 0.12 * Math.sin(v * 2),
    red: 0.12 + 0.06 * Math.sin(u * 4 + v * 3 + seed) - drift * 0.08,
    nir:
      0.35 +
      0.15 * Math.cos(u * 3 + seed * 0.7) +
      drift * 0.25 * Math.cos(v * 3 + seed * 0.2),
    swir1: 0.25 + 0.1 * Math.sin(v * 4 + seed * 0.1) - drift * 0.1,
    swir2: 0.2 + 0.08 * Math.cos(u * 5 + seed * 0.15) - drift * 0.06,
  };
}

export function computeNdvi(b: MultispectralBands): number {
  return safeRatio(b.nir, b.red);
}

export function computeNdwi(b: MultispectralBands): number {
  return safeRatio(b.green, b.nir);
}

/** Razão óxidos de ferro (B4/B2 ou R/Blue). */
export function computeIronOxideRatio(b: MultispectralBands): number {
  if (b.blue <= 0) return 0;
  return b.red / b.blue;
}

/** Alteração argilosa — índice tipo ASTER/S2 (SWIR1 / SWIR2). */
export function computeClayAlterationRatio(b: MultispectralBands): number {
  const s1 = b.swir1 ?? b.nir * 0.85;
  const s2 = b.swir2 ?? b.red * 0.9;
  if (s2 <= 0) return 0;
  return s1 / s2;
}

export function computeSpectralIndex(
  index: SpectralIndex,
  b: MultispectralBands,
): number {
  switch (index) {
    case "ndvi":
      return computeNdvi(b);
    case "ndwi":
      return computeNdwi(b);
    case "iron_oxide":
      return computeIronOxideRatio(b);
    case "clay_alteration":
      return computeClayAlterationRatio(b);
    case "false_color":
      return b.nir;
    case "grayscale":
      return 0.299 * b.red + 0.587 * b.green + 0.114 * b.blue;
    case "rgb":
    default:
      return (b.red + b.green + b.blue) / 3;
  }
}

function stretchBand(v: number, gain = 1.1): number {
  return Math.pow(Math.min(1, Math.max(0, v * gain)), 0.92);
}

function toByte(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v * 255)));
}

/** Cor de exibição a partir das bandas (RGB, P&B, falso cor ou índice). */
export function bandsToDisplayRgb(
  index: SpectralIndex,
  b: MultispectralBands,
): [number, number, number] {
  switch (index) {
    case "rgb":
      return [
        toByte(stretchBand(b.red, 1.2)),
        toByte(stretchBand(b.green, 1.15)),
        toByte(stretchBand(b.blue, 1.25)),
      ];
    case "grayscale": {
      const g =
        0.299 * stretchBand(b.red) +
        0.587 * stretchBand(b.green) +
        0.114 * stretchBand(b.blue);
      const gv = toByte(g);
      return [gv, gv, gv];
    }
    case "false_color":
      return [
        toByte(stretchBand(b.nir, 1.1)),
        toByte(stretchBand(b.red, 1.05)),
        toByte(stretchBand(b.green, 1.05)),
      ];
    default: {
      const v = computeSpectralIndex(index, b);
      return indexToRgb(index, v);
    }
  }
}

/** Converte índice escalar → RGB para visualização (0–255). */
export function indexToRgb(
  index: SpectralIndex,
  value: number,
): [number, number, number] {
  const t = Math.min(1, Math.max(0, (value + 1) / 2));
  switch (index) {
    case "ndvi":
      return ndviPalette(value);
    case "ndwi":
      return ndwiPalette(value);
    case "iron_oxide":
      return ironPalette(t);
    case "clay_alteration":
      return clayPalette(t);
    case "false_color":
      return [Math.round(t * 255), Math.round(t * 0.4 * 255), Math.round(t * 0.2 * 255)];
    default:
      return [Math.round(t * 255), Math.round(t * 255), Math.round(t * 255)];
  }
}

function ndviPalette(v: number): [number, number, number] {
  if (v < 0) return [180, 100, 80];
  if (v < 0.2) return [210, 180, 120];
  if (v < 0.4) return [160, 200, 80];
  if (v < 0.6) return [80, 160, 60];
  return [30, 100, 40];
}

function ndwiPalette(v: number): [number, number, number] {
  if (v < 0) return [160, 140, 120];
  if (v < 0.2) return [100, 160, 200];
  return [40, 100, 220];
}

function ironPalette(t: number): [number, number, number] {
  return [Math.round(80 + t * 175), Math.round(40 + t * 60), Math.round(20 + t * 30)];
}

function clayPalette(t: number): [number, number, number] {
  return [Math.round(120 + t * 80), Math.round(80 + t * 40), Math.round(160 + t * 60)];
}

/** GEE / Sentinel Hub evalscript helpers (Sentinel-2 L2A). */
export function geeIndexExpression(index: SpectralIndex): string {
  switch (index) {
    case "ndvi":
      return "(B8 - B4) / (B8 + B4)";
    case "ndwi":
      return "(B3 - B8) / (B3 + B8)";
    case "iron_oxide":
      return "B4 / B2";
    case "clay_alteration":
      return "B11 / B12";
    case "false_color":
      return "B8";
    default:
      return "B4";
  }
}

export function sentinelHubEvalscript(index: SpectralIndex): string {
  const expr = geeIndexExpression(index);
  return `//VERSION=3
function setup() {
  return { input: ["B02","B03","B04","B08","B11","B12"], output: { bands: 3 } };
}
function evaluatePixel(s) {
  const v = ${expr.replace(/B8/g, "s.B08").replace(/B4/g, "s.B04").replace(/B3/g, "s.B03").replace(/B2/g, "s.B02").replace(/B11/g, "s.B11").replace(/B12/g, "s.B12")};
  return [v, v, v];
}`;
}

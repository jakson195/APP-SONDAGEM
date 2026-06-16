/** Colormap deformação InSAR: verde (estável) → amarelo (alerta) → vermelho (crítico). */

export interface DeformationThresholds {
  /** |mm| ≤ stableMax → verde */
  stableMaxMm: number;
  /** |mm| ≥ criticalMin → vermelho; entre os dois → amarelo */
  criticalMinMm: number;
}

export const DEFAULT_DEFORMATION_THRESHOLDS: DeformationThresholds = {
  stableMaxMm: 5,
  criticalMinMm: 15,
};

const GREEN = { r: 34, g: 197, b: 94 };
const YELLOW = { r: 250, g: 204, b: 21 };
const RED = { r: 239, g: 68, b: 68 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  c0: typeof GREEN,
  c1: typeof GREEN,
  t: number,
  alpha: number,
): [number, number, number, number] {
  return [
    Math.round(lerp(c0.r, c1.r, t)),
    Math.round(lerp(c0.g, c1.g, t)),
    Math.round(lerp(c0.b, c1.b, t)),
    Math.round(alpha),
  ];
}

/**
 * Mapeia deslocamento (mm) para RGBA.
 * Usa valor absoluto para magnitude; nodata → transparente.
 */
export function deformationToRgba(
  mm: number,
  nodata: number | null,
  thresholds: DeformationThresholds,
  baseAlpha = 210,
): [number, number, number, number] {
  if (!Number.isFinite(mm)) return [0, 0, 0, 0];
  if (nodata != null && (mm === nodata || Math.abs(mm - nodata) < 1e-6)) {
    return [0, 0, 0, 0];
  }

  const mag = Math.abs(mm);
  const { stableMaxMm, criticalMinMm } = thresholds;

  if (mag <= stableMaxMm) {
    return [GREEN.r, GREEN.g, GREEN.b, baseAlpha];
  }
  if (mag >= criticalMinMm) {
    return [RED.r, RED.g, RED.b, baseAlpha];
  }

  const mid = (stableMaxMm + criticalMinMm) / 2;
  if (mag <= mid) {
    const t = (mag - stableMaxMm) / Math.max(mid - stableMaxMm, 1e-6);
    return lerpRgb(GREEN, YELLOW, t, baseAlpha);
  }
  const t = (mag - mid) / Math.max(criticalMinMm - mid, 1e-6);
  return lerpRgb(YELLOW, RED, t, baseAlpha);
}

/** Aplica colormap a um raster Float32/Float64 → ImageData. */
export function applyDeformationColormap(
  values: ArrayLike<number>,
  width: number,
  height: number,
  thresholds: DeformationThresholds,
  nodata: number | null = -9999,
): ImageData {
  const imageData = new ImageData(width, height);
  const px = imageData.data;
  for (let i = 0; i < values.length; i++) {
    const [r, g, b, a] = deformationToRgba(
      values[i] as number,
      nodata,
      thresholds,
    );
    const o = i * 4;
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = a;
  }
  return imageData;
}

export const LEGEND_STOPS: { label: string; color: string }[] = [
  { label: "Estável", color: "#22c55e" },
  { label: "Alerta", color: "#facc15" },
  { label: "Crítico", color: "#ef4444" },
];

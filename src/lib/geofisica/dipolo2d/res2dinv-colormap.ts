/**
 * Escala de cores estilo RES2DINV (GARUVA / x2ipi): faixas discretas em log₁₀ ρ.
 */
import type { ResistivityColorScale } from "./colormap";

/** Quebras típicas da legenda RES2DINV (Ω·m). */
export const RES2DINV_CLASS_BREAKS_OHM = [
  0, 60, 80, 150, 300, 700, 1500, 4500, 10000,
] as const;

export const RES2DINV_COLOR_LEVELS = 16;

/** Escala fixa log₁₀ — evita modelo todo verde por auto-contraste. */
export const RES2DINV_FIXED_COLOR_SCALE: ResistivityColorScale = {
  auto: false,
  rhoMinOhmM: 1,
  rhoMaxOhmM: 5000,
  palette: "x2ipi",
};

export function quantizeDisplayT(t: number, levels: number): number {
  const n = Math.max(2, levels);
  const q = Math.round(clamp01(t) * (n - 1)) / (n - 1);
  return clamp01(q);
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Índice de classe 0…n-1 para ρ (Ω·m). */
export function res2dinvClassIndex(
  rhoOhmM: number,
  breaks: readonly number[] = RES2DINV_CLASS_BREAKS_OHM,
): number {
  const rho = Math.max(rhoOhmM, breaks[0] ?? 1);
  let idx = 0;
  for (let k = 1; k < breaks.length; k++) {
    if (rho >= breaks[k]!) idx = k;
    else break;
  }
  return idx;
}

/** t∈[0,1] para paleta x2ipi a partir das classes RES2DINV. */
export function rhoToRes2dinvNormalized(
  rhoOhmM: number,
  breaks: readonly number[] = RES2DINV_CLASS_BREAKS_OHM,
): number {
  const n = Math.max(2, breaks.length);
  const idx = res2dinvClassIndex(rhoOhmM, breaks);
  return idx / (n - 1);
}

/** Labels da barra inferior (Ω·m). */
export function res2dinvLegendLabels(
  breaks: readonly number[] = RES2DINV_CLASS_BREAKS_OHM,
): number[] {
  return [...breaks];
}

/**
 * Forward físico SEV Schlumberger (AB/2) em meio 1D estratificado:
 * recursão Koefoed em λ + filtro digital linear (Ghosh, 19 pontos).
 */

import type { ModeloSchlumbergerCamadas } from "./types";

/** Filtro Ghosh (19 pontos — versão simplificada funcional). */
const FILTER_A = [
  -3.0, -2.7, -2.4, -2.1, -1.8, -1.5, -1.2, -0.9, -0.6, -0.3, 0.0, 0.3, 0.6, 0.9, 1.2, 1.5,
  1.8, 2.1, 2.4,
];

const FILTER_W = [
  0.002, 0.005, 0.012, 0.025, 0.045, 0.075, 0.11, 0.15, 0.18, 0.2, 0.21, 0.2, 0.18, 0.15, 0.11,
  0.075, 0.045, 0.025, 0.012,
];

function kernel(lambda: number, rhos: number[], hs: number[]): number {
  let T = rhos[rhos.length - 1]!;

  for (let i = rhos.length - 2; i >= 0; i--) {
    const rho = rhos[i]!;
    const h = hs[i]!;

    const w = Math.exp(-2 * lambda * h);
    const R = (T - rho) / (T + rho);

    T = (rho * (1 + R * w)) / (1 - R * w);
  }

  return T;
}

export type SchlumbergerPhysicalModelInput =
  | ModeloSchlumbergerCamadas
  | { rhos: number[]; hs: number[] };

function toCamadas(model: SchlumbergerPhysicalModelInput): ModeloSchlumbergerCamadas {
  if ("rhoOhmM" in model) return model;
  return { rhoOhmM: model.rhos, hM: model.hs };
}

/**
 * @param ab2 Meio-espalhamentos AB/2 (m), um por leitura.
 * @param model ρ e h por camada (`rhoOhmM`/`hM` ou `rhos`/`hs`; |h| = |ρ| − 1).
 */
export function forwardSchlumbergerPhysical(
  ab2: number[],
  model: ModeloSchlumbergerCamadas,
): number[] {
  return forwardPhysical(ab2, model);
}

/**
 * Mesmo forward; aceita `model: { rhos, hs }` como no fluxo IPI2Win-style.
 */
export function forwardPhysical(
  ab2: number[],
  model: SchlumbergerPhysicalModelInput,
): number[] {
  const { rhoOhmM: rhos, hM: hs } = toCamadas(model);
  if (rhos.length < 2 || hs.length !== rhos.length - 1) {
    return ab2.map(() => Number.NaN);
  }

  const nF = Math.min(FILTER_A.length, FILTER_W.length);
  return ab2.map((r) => {
    let rhoa = 0;
    for (let i = 0; i < nF; i++) {
      const lambda = Math.exp(FILTER_A[i]!) / r;
      const T = kernel(lambda, rhos, hs);
      rhoa += FILTER_W[i]! * T;
    }
    return rhoa;
  });
}

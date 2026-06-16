/**
 * SEV Wenner em meio espaço horizontalmente estratificado (2 camadas).
 * Potencial de superfície por método das imagens (Telford / Parasnis).
 *
 * Geometria Wenner: A–M–N–B em linha, AM = MN = NB = a, AB = 3a.
 * Se AB/2 = meio-espalhamento corrente (metade de AB), então AB = 2·(AB/2) e a = AB/3.
 */

import type { LeituraCampoVES, ModeloDuasCamadas } from "./types";

const PI = Math.PI;
const MAX_IMAGE_TERMS = 120;

export function reflectionCoeff(rho1: number, rho2: number): number {
  return (rho2 - rho1) / (rho2 + rho1);
}

/**
 * Função de Green normalizada (sem I): contribuição para V/I a partir de uma fonte +I em 0,
 * observada à distância horizontal R (m) na superfície da primeira camada.
 */
export function greenSurfaceRoverI(
  R: number,
  rho1OhmM: number,
  h1M: number,
  k: number,
): number {
  if (R <= 1e-12) return Number.POSITIVE_INFINITY;
  const c = rho1OhmM / (2 * PI);
  let s = 1 / R;
  for (let j = 1; j <= MAX_IMAGE_TERMS; j++) {
    const zj = 2 * j * h1M;
    const term = (2 * k ** j) / Math.sqrt(R * R + zj * zj);
    s += term;
    if (Math.abs(term) < 1e-15 * Math.abs(s)) break;
  }
  return c * s;
}

/** Espaçamento Wenner `a` (m) a partir de AB/2 (m). */
export function wennerAFromAbHalf(abHalfM: number): number {
  const ab = 2 * abHalfM;
  return ab / 3;
}

/**
 * Resistividade aparente Wenner para o modelo (ρ₁ até h₁, depois ρ₂ semi-infinito).
 */
export function apparentResistivityWennerTwoLayer(
  abHalfM: number,
  model: ModeloDuasCamadas,
): number {
  const { rho1OhmM, h1M, rho2OhmM } = model;
  const a = wennerAFromAbHalf(abHalfM);
  if (!(a > 0) || !(h1M > 0)) return Number.NaN;

  const k = reflectionCoeff(rho1OhmM, rho2OhmM);

  const G = (R: number) => greenSurfaceRoverI(R, rho1OhmM, h1M, k);

  const xM = a;
  const xN = 2 * a;
  const xA = 0;
  const xB = 3 * a;

  const Phi = (x: number) =>
    1 * G(Math.abs(x - xA)) - 1 * G(Math.abs(x - xB));

  const VoverI = Phi(xN) - Phi(xM);
  /** Sinal da diferença de potencial depende da convenção A/B; ρa é sempre positiva. */
  return 2 * PI * a * Math.abs(VoverI);
}

/** Curva sintética ρa para vários AB/2. */
export function syntheticCurveWenner(
  abHalfM: number[],
  model: ModeloDuasCamadas,
): number[] {
  return abHalfM.map((ab) => apparentResistivityWennerTwoLayer(ab, model));
}

/** Erro médio quadrático em log₁₀(ρ). */
export function rmseLogRho(
  measured: LeituraCampoVES[],
  synthetic: number[],
): number {
  return rmseLogRhoValues(
    measured.map((m) => m.rhoApparentOhmM),
    synthetic,
  );
}

export function rmseLogRhoValues(
  measuredRho: number[],
  synthetic: number[],
): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < measuredRho.length; i++) {
    const rm = measuredRho[i]!;
    const rs = synthetic[i]!;
    if (!(rm > 0) || !(rs > 0) || !Number.isFinite(rs)) continue;
    const d = Math.log10(rm) - Math.log10(rs);
    s += d * d;
    n++;
  }
  return n > 0 ? Math.sqrt(s / n) : Number.POSITIVE_INFINITY;
}

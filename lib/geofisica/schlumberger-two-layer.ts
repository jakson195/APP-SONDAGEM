/**
 * SEV Schlumberger colinear (2 camadas): método das imagens.
 *
 * Geometria centrada na origem:
 * - Corrente: A em −s, B em +s  →  AB/2 = s (meio-espalhamento corrente).
 * - Potencial: M em −b, N em +b  →  MN/2 = b (meio-espalhamento potencial).
 *
 * ρa = π (s² − b²) / (2b) · |ΔV|/I  (convencional; requer s > b > 0).
 */

import type { LeituraCampoVES, ModeloDuasCamadas } from "./types";
import { greenSurfaceRoverI, reflectionCoeff } from "./wenner-two-layer";

const PI = Math.PI;

export function apparentResistivitySchlumbergerTwoLayer(
  abHalfM: number,
  mnHalfM: number,
  model: ModeloDuasCamadas,
): number {
  const s = abHalfM;
  const b = mnHalfM;
  if (!(s > b) || !(b > 0)) return Number.NaN;

  const { rho1OhmM, h1M, rho2OhmM } = model;
  if (!(h1M > 0)) return Number.NaN;

  const k = reflectionCoeff(rho1OhmM, rho2OhmM);
  const G = (R: number) => greenSurfaceRoverI(R, rho1OhmM, h1M, k);

  const xA = -s;
  const xB = s;
  const xM = -b;
  const xN = b;

  const Phi = (x: number) =>
    G(Math.abs(x - xA)) - G(Math.abs(x - xB));

  const VoverI = Math.abs(Phi(xN) - Phi(xM));
  return (PI * (s * s - b * b)) / (2 * b) * VoverI;
}

export function syntheticCurveSchlumberger(
  abHalfM: number[],
  mnHalfM: number,
  model: ModeloDuasCamadas,
): number[] {
  return abHalfM.map((s) =>
    apparentResistivitySchlumbergerTwoLayer(s, mnHalfM, model),
  );
}

/**
 * SEV colinear dipolo-dipolo (2 camadas), método das imagens.
 *
 * Geometria: A=0, B=a (dipolo corrente); M=(n+1)a, N=(n+2)a (dipolo potencial).
 * Factor geométrico (meio espaço homogéneo): K = π·a·n·(n+1)·(n+2).
 * ρa = K · |ΔV / I|.
 */

import type { LeituraCampoDipoloDipolo, ModeloDuasCamadas } from "./types";
import {
  greenSurfaceRoverI,
  reflectionCoeff,
  rmseLogRhoValues,
} from "./wenner-two-layer";

const PI = Math.PI;

/** Factor geométrico K (Ω·m por Ω de transferência) para colinear dipolo-dipolo. */
export function geometricFactorDipoloDipolo(aM: number, n: number): number {
  const nn = Math.max(1, Math.round(n));
  return PI * aM * nn * (nn + 1) * (nn + 2);
}

export function apparentResistivityDipoloDipoloTwoLayer(
  aM: number,
  n: number,
  model: ModeloDuasCamadas,
): number {
  const { rho1OhmM, h1M, rho2OhmM } = model;
  if (!(aM > 0) || !(h1M > 0)) return Number.NaN;
  const ni = Math.max(1, Math.round(n));
  const a = aM;

  const k = reflectionCoeff(rho1OhmM, rho2OhmM);
  const G = (R: number) => greenSurfaceRoverI(R, rho1OhmM, h1M, k);

  const xA = 0;
  const xB = a;
  const xM = (ni + 1) * a;
  const xN = (ni + 2) * a;

  const Phi = (x: number) =>
    1 * G(Math.abs(x - xA)) - 1 * G(Math.abs(x - xB));

  const VoverI = Phi(xM) - Phi(xN);
  const K = geometricFactorDipoloDipolo(a, ni);
  return K * Math.abs(VoverI);
}

export function syntheticCurveDipoloDipolo(
  nValues: number[],
  aM: number,
  model: ModeloDuasCamadas,
): number[] {
  return nValues.map((nv) => apparentResistivityDipoloDipoloTwoLayer(aM, nv, model));
}

/** RMSE em log₁₀(ρ) a partir de leituras dipolo-dipolo. */
export function rmseLogRhoDipolo(
  leituras: LeituraCampoDipoloDipolo[],
  synthetic: number[],
): number {
  return rmseLogRhoValues(
    leituras.map((l) => l.rhoApparentOhmM),
    synthetic,
  );
}

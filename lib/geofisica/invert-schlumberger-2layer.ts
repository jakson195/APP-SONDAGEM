import type { LeituraCampoVES, ModeloDuasCamadas } from "./types";
import { rmseLogRho } from "./wenner-two-layer";
import {
  apparentResistivitySchlumbergerTwoLayer,
  syntheticCurveSchlumberger,
} from "./schlumberger-two-layer";

export type InversaoResultado = {
  model: ModeloDuasCamadas;
  rmseLog: number;
  syntheticRho: number[];
};

/**
 * Inversão 2 camadas para SEV Schlumberger (s = AB/2, MN/2 fixo em todas as leituras).
 */
export function invertSchlumbergerTwoLayerGrid(
  leituras: LeituraCampoVES[],
  mnHalfM: number,
  rho1Fixed: number,
): InversaoResultado | null {
  if (!(mnHalfM > 0)) return null;

  const valid = leituras
    .filter(
      (L) =>
        L.abHalfM > mnHalfM &&
        L.rhoApparentOhmM > 0 &&
        Number.isFinite(L.abHalfM) &&
        Number.isFinite(L.rhoApparentOhmM),
    )
    .sort((a, b) => a.abHalfM - b.abHalfM);

  if (valid.length < 3) return null;

  const ab = valid.map((l) => l.abHalfM);
  const abMin = Math.min(...ab);
  const abMax = Math.max(...ab);

  let best: InversaoResultado | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const rho1 = Math.max(1e-6, rho1Fixed);
  const logH1Min = Math.log10(abMin / 50);
  const logH1Max = Math.log10(abMax * 30);
  const logR2Min = Math.log10(rho1 * 0.05);
  const logR2Max = Math.log10(rho1 * 80);

  const nGrid = 28;
  for (let i = 0; i <= nGrid; i++) {
    const logH = logH1Min + (i / nGrid) * (logH1Max - logH1Min);
    const h1 = 10 ** logH;
    for (let j = 0; j <= nGrid; j++) {
      const logR2 = logR2Min + (j / nGrid) * (logR2Max - logR2Min);
      const rho2 = 10 ** logR2;
      const model: ModeloDuasCamadas = {
        rho1OhmM: rho1,
        h1M: h1,
        rho2OhmM: rho2,
      };
      const syn = syntheticCurveSchlumberger(ab, mnHalfM, model);
      const err = rmseLogRho(valid, syn);
      if (err < bestScore && Number.isFinite(err)) {
        bestScore = err;
        best = { model, rmseLog: err, syntheticRho: syn };
      }
    }
  }

  if (!best) return null;

  let m = best.model;
  let syn = best.syntheticRho;
  let err = best.rmseLog;
  const step = 12;
  for (let pass = 0; pass < 3; pass++) {
    for (let dh = -step; dh <= step; dh++) {
      for (let dr = -step; dr <= step; dr++) {
        const hTry = m.h1M * 10 ** (dh * 0.02);
        const rTry = m.rho2OhmM * 10 ** (dr * 0.02);
        const trial: ModeloDuasCamadas = {
          rho1OhmM: rho1,
          h1M: Math.max(1e-4, hTry),
          rho2OhmM: Math.max(1e-6, rTry),
        };
        const s2 = syntheticCurveSchlumberger(ab, mnHalfM, trial);
        const e2 = rmseLogRho(valid, s2);
        if (e2 < err) {
          err = e2;
          m = trial;
          syn = s2;
        }
      }
    }
  }

  return { model: m, rmseLog: err, syntheticRho: syn };
}

export function forwardSchlumbergerFromModel(
  leituras: LeituraCampoVES[],
  mnHalfM: number,
  model: ModeloDuasCamadas,
): number[] {
  return leituras.map((l) =>
    apparentResistivitySchlumbergerTwoLayer(l.abHalfM, mnHalfM, model),
  );
}

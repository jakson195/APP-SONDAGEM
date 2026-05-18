import type { LeituraCampoVES, ModeloDuasCamadas } from "./types";
import {
  apparentResistivityWennerTwoLayer,
  rmseLogRho,
  syntheticCurveWenner,
} from "./wenner-two-layer";

export type InversaoResultado = {
  model: ModeloDuasCamadas;
  rmseLog: number;
  syntheticRho: number[];
};

/**
 * Inversão 1D simples (2 camadas): grelha grossa + refinamento local.
 * Adequado a dados de SEV Wenner sem polarização espúria.
 */
export function invertWennerTwoLayerGrid(
  leituras: LeituraCampoVES[],
  rho1Fixed: number,
): InversaoResultado | null {
  const valid = leituras
    .filter(
      (L) =>
        L.abHalfM > 0 &&
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
    const logH =
      logH1Min + (i / nGrid) * (logH1Max - logH1Min);
    const h1 = 10 ** logH;
    for (let j = 0; j <= nGrid; j++) {
      const logR2 =
        logR2Min + (j / nGrid) * (logR2Max - logR2Min);
      const rho2 = 10 ** logR2;
      const model: ModeloDuasCamadas = { rho1OhmM: rho1, h1M: h1, rho2OhmM: rho2 };
      const syn = syntheticCurveWenner(ab, model);
      const err = rmseLogRho(valid, syn);
      if (err < bestScore && Number.isFinite(err)) {
        bestScore = err;
        best = { model, rmseLog: err, syntheticRho: syn };
      }
    }
  }

  if (!best) return null;

  // Refinamento: perturbações pequenas em h₁ e ρ₂
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
        const s2 = syntheticCurveWenner(ab, trial);
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

/** Curva modelo para as mesmas AB/2 das leituras. */
export function forwardFromModel(
  leituras: LeituraCampoVES[],
  model: ModeloDuasCamadas,
): number[] {
  return leituras.map((l) =>
    apparentResistivityWennerTwoLayer(l.abHalfM, model),
  );
}

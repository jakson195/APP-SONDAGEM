import type { LeituraCampoDipoloDipolo, ModeloDuasCamadas } from "./types";
import {
  apparentResistivityDipoloDipoloTwoLayer,
  rmseLogRhoDipolo,
  syntheticCurveDipoloDipolo,
} from "./dipolo-dipolo-two-layer";

export type InversaoDipoloResultado = {
  model: ModeloDuasCamadas;
  rmseLog: number;
  syntheticRho: number[];
};

/**
 * Inversão 1D (2 camadas) para dados dipolo-dipolo com comprimento de dipolo `a` fixo.
 */
export function invertDipoloDipoloTwoLayerGrid(
  leituras: LeituraCampoDipoloDipolo[],
  aFixedM: number,
  rho1Fixed: number,
): InversaoDipoloResultado | null {
  const valid = leituras
    .filter(
      (L) =>
        L.aM > 0 &&
        L.n >= 1 &&
        L.rhoApparentOhmM > 0 &&
        Number.isFinite(L.n) &&
        Number.isFinite(L.rhoApparentOhmM),
    )
    .sort((a, b) => a.n - b.n);
  if (valid.length < 3) return null;

  const aUse = Math.max(1e-9, aFixedM);
  const nList = valid.map((l) => l.n);
  const nMin = Math.min(...nList);
  const nMax = Math.max(...nList);

  let best: InversaoDipoloResultado | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const rho1 = Math.max(1e-6, rho1Fixed);
  const depthScaleMin = (aUse * nMin) / 50;
  const depthScaleMax = aUse * nMax * 35;
  const logH1Min = Math.log10(Math.max(1e-4, depthScaleMin));
  const logH1Max = Math.log10(Math.max(depthScaleMin * 2, depthScaleMax));
  const logR2Min = Math.log10(rho1 * 0.05);
  const logR2Max = Math.log10(rho1 * 80);

  const nGrid = 28;
  for (let i = 0; i <= nGrid; i++) {
    const logH = logH1Min + (i / nGrid) * (logH1Max - logH1Min);
    const h1 = 10 ** logH;
    for (let j = 0; j <= nGrid; j++) {
      const logR2 = logR2Min + (j / nGrid) * (logR2Max - logR2Min);
      const rho2 = 10 ** logR2;
      const model: ModeloDuasCamadas = { rho1OhmM: rho1, h1M: h1, rho2OhmM: rho2 };
      const syn = syntheticCurveDipoloDipolo(nList, aUse, model);
      const err = rmseLogRhoDipolo(valid, syn);
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
        const s2 = syntheticCurveDipoloDipolo(nList, aUse, trial);
        const e2 = rmseLogRhoDipolo(valid, s2);
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

export function forwardDipoloFromModel(
  leituras: LeituraCampoDipoloDipolo[],
  aFixedM: number,
  model: ModeloDuasCamadas,
): number[] {
  return leituras.map((l) =>
    apparentResistivityDipoloDipoloTwoLayer(aFixedM, l.n, model),
  );
}

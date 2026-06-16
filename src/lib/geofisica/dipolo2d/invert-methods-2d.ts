/**
 * Inversão gaussiana 2D no browser (matriz G + regularização).
 * Para inversão física ResIPy R2, usar `invertDipolo2DPhysics` (:8092).
 */

import {
  acceptLineSearch,
  clampHybridAlpha,
  finalizeResult,
  huberWeights,
  hybridIrlsWeights,
  initialModelFromBackproject,
  l1IrlsWeights,
  objective,
  prepareInvertProblem,
  pushIterationRecord,
  roughnessAnisoFromModel,
  roughnessL2FromModel,
  solveGaussNewtonIncrement,
  solveRegularized,
} from "./invert-core-2d";

const regX = (p: Dipolo2DInvertParams) => p.lambdaX ?? 0.1;
const regZ = (p: Dipolo2DInvertParams) => p.lambdaZ ?? 0.4;
import type {
  Dipolo2DInvertMethodId,
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
  Dipolo2DReading,
} from "./types";
import { DIPOLO2D_INVERT_METHODS } from "./types";

function methodLabel(id: Dipolo2DInvertMethodId): string {
  return DIPOLO2D_INVERT_METHODS.find((m) => m.id === id)?.label ?? id;
}

function methodDataAlpha(
  methodId: Dipolo2DInvertMethodId,
  p: Dipolo2DInvertParams,
): number {
  switch (methodId) {
    case "hybrid":
      return clampHybridAlpha(p.hybridAlpha ?? 0.65);
    case "robust_l1":
      return 0;
    default:
      return 1;
  }
}

function resultLabel(id: Dipolo2DInvertMethodId, p: Dipolo2DInvertParams): string {
  const a = methodDataAlpha(id, p);
  const base = methodLabel(id);
  if (id === "hybrid") return `${base} (α=${a.toFixed(2)})`;
  if (id === "robust_l1" && a <= 0.001) return base;
  return base;
}

/** 1. Least Squares — uma única solução regularizada (L2 dados + suavidade). */
function invertLeastSquares(
  prob: NonNullable<ReturnType<typeof prepareInvertProblem>>,
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult {
  const { G, yObs, Hreg, wData, x0, x1, zMax, nx, nz, nd, nm, ridge } = prob;
  const w = wData.map((wd) => wd);
  const m =
    solveRegularized(G, yObs, w, Hreg, p.lambda, nm, ridge) ??
    initialModelFromBackproject(G, yObs, nd, nm);
  const best = objective(G, yObs, m, wData, p.huberC, p.lambda, nx, nz, 1);
  const history: Dipolo2DInvertResult["iterationHistory"] = [];
  pushIterationRecord(
    history,
    0,
    best.res,
    nd,
    p.lambda,
    best.phi,
    roughnessL2FromModel(m, nx, nz),
    null,
  );
  return finalizeResult(
    m,
    yObs,
    best.pred,
    x0,
    x1,
    zMax,
    nx,
    nz,
    1,
    history,
    "least_squares",
    methodLabel("least_squares"),
  );
}

/** 2. Occam — λ alto → reduz até atingir alvo de ajuste aos dados. */
function invertOccam(
  prob: NonNullable<ReturnType<typeof prepareInvertProblem>>,
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult | null {
  const { G, yObs, Hreg, wData, x0, x1, zMax, nx, nz, nd, nm, ridge } = prob;
  let m = initialModelFromBackproject(G, yObs, nd, nm);
  let lambda = Math.max(p.lambdaMin, p.lambda * 8);
  const history: Dipolo2DInvertResult["iterationHistory"] = [];
  let prevPhi: number | null = null;

  let best = objective(G, yObs, m, wData, p.huberC, lambda, nx, nz, 1);
  pushIterationRecord(
    history,
    0,
    best.res,
    nd,
    lambda,
    best.phi,
    roughnessL2FromModel(m, nx, nz),
    null,
  );
  prevPhi = best.phi;
  const targetRms = Math.max(p.huberC * 1.2, best.res.length ? p.huberC : 0.02);

  for (let iter = 1; iter <= p.maxIter; iter++) {
    const w = wData.map((wd, d) => wd);
    const candidate = solveRegularized(G, yObs, w, Hreg, lambda, nm, ridge);
    if (!candidate) break;

    const step = acceptLineSearch(
      G,
      yObs,
      m,
      candidate,
      wData,
      p.huberC,
      lambda,
      nx,
      nz,
      best,
      1,
    );
    m = step.m;
    best = step.best;
    if (!step.accepted) break;

    pushIterationRecord(
      history,
      iter,
      best.res,
      nd,
      lambda,
      best.phi,
      roughnessL2FromModel(m, nx, nz),
      prevPhi,
    );
    prevPhi = best.phi;

    const rms =
      Math.sqrt(
        best.res.reduce((s, r) => s + r * r, 0) / Math.max(1, nd),
      );
    if (rms <= targetRms || lambda <= p.lambdaMin) {
      return finalizeResult(
        m,
        yObs,
        best.pred,
        x0,
        x1,
        zMax,
        nx,
        nz,
        iter,
        history,
        "occam",
        methodLabel("occam"),
      );
    }
    lambda = Math.max(p.lambdaMin, lambda * p.lambdaDecay);
  }

  return finalizeResult(
    m,
    yObs,
    best.pred,
    x0,
    x1,
    zMax,
    nx,
    nz,
    history.length,
    history,
    "occam",
    methodLabel("occam"),
  );
}

/** 3. Gauss-Newton — δd ≈ J δm, J≈G, atualização iterativa + IRLS L1 nos resíduos. */
function invertGaussNewton(
  prob: NonNullable<ReturnType<typeof prepareInvertProblem>>,
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult {
  const { G, yObs, Hreg, wData, x0, x1, zMax, nx, nz, nd, nm, ridge } = prob;
  let m = initialModelFromBackproject(G, yObs, nd, nm);
  const lambda = p.lambda;
  const history: Dipolo2DInvertResult["iterationHistory"] = [];
  let prevPhi: number | null = null;

  let best = objective(
    G,
    yObs,
    m,
    wData,
    p.huberC,
    lambda,
    nx,
    nz,
    0,
    regX(p),
    regZ(p),
  );
  pushIterationRecord(
    history,
    0,
    best.res,
    nd,
    lambda,
    best.phi,
    roughnessAnisoFromModel(m, nx, nz, regX(p), regZ(p)),
    null,
  );
  prevPhi = best.phi;

  for (let iter = 1; iter <= p.maxIter; iter++) {
    const wL1 = l1IrlsWeights(best.res);
    const w = wL1.map((wl, d) => wl * (wData[d] ?? 1));
    const dm =
      solveGaussNewtonIncrement(G, yObs, m, w, Hreg, lambda, nm, ridge) ??
      null;
    if (!dm) break;

    const alphas = [1, 0.75, 0.5, 0.3, 0.15];
    let accepted = false;
    for (const alpha of alphas) {
      const trialM = m.map((v, i) => v + alpha * (dm[i] ?? 0));
      const trial = objective(
        G,
        yObs,
        trialM,
        wData,
        p.huberC,
        lambda,
        nx,
        nz,
        0,
        regX(p),
        regZ(p),
      );
      if (trial.phi < best.phi) {
        m = trialM;
        best = trial;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;

    pushIterationRecord(
      history,
      iter,
      best.res,
      nd,
      lambda,
      best.phi,
      roughnessAnisoFromModel(m, nx, nz, regX(p), regZ(p)),
      prevPhi,
    );
    const gain = prevPhi != null && prevPhi > 0 ? (prevPhi - best.phi) / prevPhi : 0;
    prevPhi = best.phi;
    if (gain < p.minImprovement) break;
  }

  return finalizeResult(
    m,
    yObs,
    best.pred,
    x0,
    x1,
    zMax,
    nx,
    nz,
    history.length,
    history,
    "gauss_newton",
    methodLabel("gauss_newton"),
  );
}

/** 4. Smoothness constrained — IRLS Huber + decaimento de λ (estilo RES2DINV-like). */
function invertSmoothness(
  prob: NonNullable<ReturnType<typeof prepareInvertProblem>>,
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult {
  const { G, yObs, Hreg, wData, x0, x1, zMax, nx, nz, nd, nm, ridge } = prob;
  let m = initialModelFromBackproject(G, yObs, nd, nm);
  let lambda = Math.max(p.lambdaMin, p.lambda);
  const history: Dipolo2DInvertResult["iterationHistory"] = [];
  let prevPhi: number | null = null;

  let best = objective(G, yObs, m, wData, p.huberC, lambda, nx, nz, 1);
  pushIterationRecord(
    history,
    0,
    best.res,
    nd,
    lambda,
    best.phi,
    roughnessL2FromModel(m, nx, nz),
    null,
  );
  prevPhi = best.phi;

  for (let iter = 1; iter <= p.maxIter; iter++) {
    const wHub = huberWeights(best.res, p.huberC);
    const w = wHub.map((wh, d) => wh * (wData[d] ?? 1));
    const candidate = solveRegularized(G, yObs, w, Hreg, lambda, nm, ridge);
    if (!candidate) break;

    const step = acceptLineSearch(
      G,
      yObs,
      m,
      candidate,
      wData,
      p.huberC,
      lambda,
      nx,
      nz,
      best,
      1,
    );
    m = step.m;
    best = step.best;
    if (!step.accepted) break;

    pushIterationRecord(
      history,
      iter,
      best.res,
      nd,
      lambda,
      best.phi,
      roughnessL2FromModel(m, nx, nz),
      prevPhi,
    );
    const gain = prevPhi != null && prevPhi > 0 ? (prevPhi - best.phi) / prevPhi : 0;
    prevPhi = best.phi;
    if (gain < p.minImprovement) {
      return finalizeResult(
        m,
        yObs,
        best.pred,
        x0,
        x1,
        zMax,
        nx,
        nz,
        iter,
        history,
        "smoothness",
        methodLabel("smoothness"),
      );
    }
    lambda = Math.max(p.lambdaMin, lambda * p.lambdaDecay);
  }

  return finalizeResult(
    m,
    yObs,
    best.pred,
    x0,
    x1,
    zMax,
    nx,
    nz,
    history.length,
    history,
    "smoothness",
    methodLabel("smoothness"),
  );
}

/** 5. Híbrida L2/L1 — IRLS com pesos Huber+L1 misturados + decaimento λ. */
function invertHybrid(
  prob: NonNullable<ReturnType<typeof prepareInvertProblem>>,
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult {
  const { G, yObs, Hreg, wData, x0, x1, zMax, nx, nz, nd, nm, ridge } = prob;
  const alpha = methodDataAlpha("hybrid", p);
  let m = initialModelFromBackproject(G, yObs, nd, nm);
  let lambda = Math.max(p.lambdaMin, p.lambda);
  const history: Dipolo2DInvertResult["iterationHistory"] = [];
  let prevPhi: number | null = null;

  let best = objective(G, yObs, m, wData, p.huberC, lambda, nx, nz, alpha);
  pushIterationRecord(
    history,
    0,
    best.res,
    nd,
    lambda,
    best.phi,
    roughnessL2FromModel(m, nx, nz),
    null,
  );
  prevPhi = best.phi;

  for (let iter = 1; iter <= p.maxIter; iter++) {
    const wMix = hybridIrlsWeights(best.res, p.huberC, alpha);
    const w = wMix.map((wm, d) => wm * (wData[d] ?? 1));
    const candidate = solveRegularized(G, yObs, w, Hreg, lambda, nm, ridge);
    if (!candidate) break;

    const step = acceptLineSearch(
      G,
      yObs,
      m,
      candidate,
      wData,
      p.huberC,
      lambda,
      nx,
      nz,
      best,
      alpha,
    );
    m = step.m;
    best = step.best;
    if (!step.accepted) break;

    pushIterationRecord(
      history,
      iter,
      best.res,
      nd,
      lambda,
      best.phi,
      roughnessL2FromModel(m, nx, nz),
      prevPhi,
    );
    const gain = prevPhi != null && prevPhi > 0 ? (prevPhi - best.phi) / prevPhi : 0;
    prevPhi = best.phi;
    if (gain < p.minImprovement) {
      return finalizeResult(
        m,
        yObs,
        best.pred,
        x0,
        x1,
        zMax,
        nx,
        nz,
        iter,
        history,
        "hybrid",
        resultLabel("hybrid", p),
      );
    }
    lambda = Math.max(p.lambdaMin, lambda * p.lambdaDecay);
  }

  return finalizeResult(
    m,
    yObs,
    best.pred,
    x0,
    x1,
    zMax,
    nx,
    nz,
    history.length,
    history,
    "hybrid",
    resultLabel("hybrid", p),
  );
}

/** 6. Inversão robusta L1 — min Σ|d_obs−d_calc| via IRLS + Gauss-Newton. */
function invertRobustL1(
  prob: NonNullable<ReturnType<typeof prepareInvertProblem>>,
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult {
  const { G, yObs, Hreg, wData, x0, x1, zMax, nx, nz, nd, nm, ridge } = prob;
  let m = initialModelFromBackproject(G, yObs, nd, nm);
  const lambda = p.lambda;
  const history: Dipolo2DInvertResult["iterationHistory"] = [];
  let prevPhi: number | null = null;

  let best = objective(
    G,
    yObs,
    m,
    wData,
    p.huberC,
    lambda,
    nx,
    nz,
    0,
    regX(p),
    regZ(p),
  );
  pushIterationRecord(
    history,
    0,
    best.res,
    nd,
    lambda,
    best.phi,
    roughnessAnisoFromModel(m, nx, nz, regX(p), regZ(p)),
    null,
  );
  prevPhi = best.phi;

  for (let iter = 1; iter <= p.maxIter; iter++) {
    const wL1 = l1IrlsWeights(best.res, Math.max(1e-4, p.huberC * 0.25));
    const w = wL1.map((wl, d) => wl * (wData[d] ?? 1));
    const dm =
      solveGaussNewtonIncrement(G, yObs, m, w, Hreg, lambda, nm, ridge) ??
      null;
    if (!dm) break;

    const alphas = [1, 0.75, 0.5, 0.3, 0.15];
    let accepted = false;
    for (const alpha of alphas) {
      const trialM = m.map((v, i) => v + alpha * (dm[i] ?? 0));
      const trial = objective(
        G,
        yObs,
        trialM,
        wData,
        p.huberC,
        lambda,
        nx,
        nz,
        0,
        regX(p),
        regZ(p),
      );
      if (trial.phi < best.phi) {
        m = trialM;
        best = trial;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;

    pushIterationRecord(
      history,
      iter,
      best.res,
      nd,
      lambda,
      best.phi,
      roughnessAnisoFromModel(m, nx, nz, regX(p), regZ(p)),
      prevPhi,
    );
    const gain = prevPhi != null && prevPhi > 0 ? (prevPhi - best.phi) / prevPhi : 0;
    prevPhi = best.phi;
    if (gain < p.minImprovement) break;
  }

  return finalizeResult(
    m,
    yObs,
    best.pred,
    x0,
    x1,
    zMax,
    nx,
    nz,
    history.length,
    history,
    "robust_l1",
    resultLabel("robust_l1", p),
  );
}

/** Inversão gaussiana instantânea (browser) — preset original da UI. */
export function invertDipolo2D(
  readings: Dipolo2DReading[],
  p: Dipolo2DInvertParams,
  method: Dipolo2DInvertMethodId = "smoothness",
  qcByRow?: Map<number, { qualityScore: number; isSpike: boolean }>,
): Dipolo2DInvertResult | null {
  const active = readings.filter((r) => !r.excluded && r.rhoApparentOhmM > 0);
  if (active.length < 4) return null;

  const prob = prepareInvertProblem(active, p, qcByRow);
  if (!prob) return null;

  let result: Dipolo2DInvertResult | null = null;
  switch (method) {
    case "least_squares":
      result = invertLeastSquares(prob, p);
      break;
    case "occam":
      result = invertOccam(prob, p);
      break;
    case "gauss_newton":
      result = invertGaussNewton(prob, p);
      break;
    case "smoothness":
      result = invertSmoothness(prob, p);
      break;
    case "robust_l1":
    case "blocky_l1":
      result = invertRobustL1(prob, p);
      break;
    case "hybrid":
      result = invertHybrid(prob, p);
      break;
    default:
      result = invertSmoothness(prob, p);
  }
  if (!result) return null;
  return { ...result, engine: "proxy" };
}

import type { Dipolo2DInvertParams, Dipolo2DReading } from "./types";

/** Fator RES2DINV para profundidade máxima do modelo (× n × a). */
export const RES2DINV_MODEL_DEPTH_FACTOR = 1.0;

/** «Model depth range» RES2DINV (1.05 ≈ +5 % sobre max pseudodepth). */
export const RES2DINV_MODEL_DEPTH_RANGE = 1.05;

/** Fator ResIPy FMD / pseudoseção (sensibilidade) — não usar para z_max do modelo. */
export const RESIPY_FMD_DEPTH_FACTOR = 0.286;

export type ModelDepthOptions = {
  modelDepthFactor?: number;
  modelDepthRange?: number;
  minDepthM?: number;
};

/**
 * Profundidade máxima do modelo (estilo RES2DINV):
 * max(n·a) × modelDepthFactor × modelDepthRange.
 * `factorDepth` (0.286) continua só para sensibilidade / pseudoseção.
 */
export function computeModelZMaxM(
  readings: Dipolo2DReading[],
  params?: Pick<Dipolo2DInvertParams, "modelDepthFactor" | "modelDepthRange"> | ModelDepthOptions,
): number {
  const opts: ModelDepthOptions =
    params && ("modelDepthFactor" in params || "modelDepthRange" in params)
      ? params
      : {};
  const factor = opts.modelDepthFactor ?? RES2DINV_MODEL_DEPTH_FACTOR;
  const range = opts.modelDepthRange ?? RES2DINV_MODEL_DEPTH_RANGE;

  let zMax = 0;
  for (const r of readings) {
    if (r.aM > 0 && r.n >= 1 && Number.isFinite(r.stationM)) {
      zMax = Math.max(zMax, factor * r.n * r.aM);
    }
  }

  const aVals = readings.map((r) => r.aM).filter((a) => a > 0);
  const aMed =
    aVals.length > 0
      ? aVals.reduce((acc, a) => acc + a, 0) / aVals.length
      : 15;
  const floor = opts.minDepthM ?? Math.max(aMed * 2, 5);
  return Math.max(zMax * range, floor);
}

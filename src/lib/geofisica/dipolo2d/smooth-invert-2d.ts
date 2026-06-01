/**
 * Inversão 2D suavizada estilo “RES2DINV-like” para perfil dipolo-dipolo.
 * Implementação em `invert-methods-2d.ts` (método «smoothness»).
 */

import { buildSensitivityMatrix, accumulateRoughnessH } from "./invert-core-2d";
import { invertDipolo2D } from "./invert-methods-2d";
import type {
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
  Dipolo2DReading,
} from "./types";

export { buildSensitivityMatrix, accumulateRoughnessH };

export function invertDipolo2DSmoothRes2dinvLike(
  readings: Dipolo2DReading[],
  p: Dipolo2DInvertParams,
): Dipolo2DInvertResult | null {
  return invertDipolo2D(readings, p, "smoothness");
}

/** Parâmetros calibrados para .dat RES2DINV (dipolo-dipolo, ex. Garuva). */
export const res2dinvDataPreset: Dipolo2DInvertParams = {
  factorDepth: 0.286,
  sigmaXM: 4,
  sigmaZM: 2,
  lambda: 0.2,
  huberC: 0.03,
  maxIter: 20,
  lambdaDecay: 0.88,
  lambdaMin: 0.03,
  minImprovement: 0.0006,
  nx: 40,
  nz: 22,
  hybridAlpha: 1,
};

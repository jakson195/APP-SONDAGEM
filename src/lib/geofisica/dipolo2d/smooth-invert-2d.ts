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

import { RES2DINV_INVERT_PARAMS } from "./res2dinv-preset";

/** Parâmetros calibrados para .dat RES2DINV (dipolo-dipolo, ex. Garuva). */
export const res2dinvDataPreset: Dipolo2DInvertParams = {
  ...RES2DINV_INVERT_PARAMS,
  nx: 40,
  nz: 22,
};

/** Alias — preset principal RES2DINV (L1 + λ anisotrópico). */
export const res2dinvSharpPreset: Dipolo2DInvertParams = {
  ...RES2DINV_INVERT_PARAMS,
};

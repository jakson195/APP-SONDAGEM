/**
 * Presets RES2DINV / ResIPy para dipolo-dipolo (sem inversão proxy).
 */

import {
  PRECISION_RESIPY_INVERT_PARAMS,
  RES2DINV_INVERT_PARAMS,
} from "./res2dinv-preset";

/** Preset alta qualidade (.dat Garuva / referência RES2DINV). */
export const res2dinvDataPreset = {
  ...PRECISION_RESIPY_INVERT_PARAMS,
};

/** Alias — preset principal RES2DINV (L1 + λ anisotrópico). */
export const res2dinvSharpPreset = {
  ...RES2DINV_INVERT_PARAMS,
};

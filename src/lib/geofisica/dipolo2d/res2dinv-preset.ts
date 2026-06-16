/**
 * Presets RES2DINV / ResIPy — rápido (padrão) vs precisão.
 */
import type { ResistivityColorScale } from "./colormap";
import {
  RES2DINV_COLOR_LEVELS,
  RES2DINV_FIXED_COLOR_SCALE,
  RESIPY_RESULTS_LEGEND_BREAKS_OHM,
} from "./res2dinv-colormap";
import type { ModelDisplayScale } from "./model-visual-scale";
import { DEFAULT_RESIPY_WORKFLOW } from "./resipy-workflow";
import {
  RES2DINV_MODEL_DEPTH_FACTOR,
  RES2DINV_MODEL_DEPTH_RANGE,
  RESIPY_FMD_DEPTH_FACTOR,
} from "./model-depth";
import type { Dipolo2DInvertMethodId, Dipolo2DInvertParams } from "./types";

export { RES2DINV_COLOR_LEVELS, RES2DINV_FIXED_COLOR_SCALE };

/** Base rápida: malha leve, 5 iterações, sem pós-processo pesado. */
const RES2DINV_FAST_BASE: Dipolo2DInvertParams = {
  factorDepth: RESIPY_FMD_DEPTH_FACTOR,
  modelDepthFactor: RES2DINV_MODEL_DEPTH_FACTOR,
  modelDepthRange: RES2DINV_MODEL_DEPTH_RANGE,
  sigmaXM: 3,
  sigmaZM: 1.5,
  huberC: 0.1,
  maxIter: 5,
  lambda: 0.02,
  lambdaX: 0.012,
  lambdaZ: 0.045,
  lambdaDecay: 0.9,
  lambdaMin: 0.00005,
  minImprovement: 0.00005,
  nx: 16,
  nz: 8,
  hybridAlpha: 0,
  ...DEFAULT_RESIPY_WORKFLOW,
};

/** Padrão UI — inversão rápida e estável (Gauss-Newton L2). */
export const RES2DINV_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...RES2DINV_FAST_BASE,
};

/**
 * Inversão gaussiana no browser — preset original (malha 22×12, suavizada L2).
 * Usado por defeito na UI; ResIPy (:8092) é opcional.
 */
export const PROXY_INVERT_PARAMS: Dipolo2DInvertParams = {
  factorDepth: RESIPY_FMD_DEPTH_FACTOR,
  modelDepthFactor: RES2DINV_MODEL_DEPTH_FACTOR,
  modelDepthRange: RES2DINV_MODEL_DEPTH_RANGE,
  sigmaXM: 3,
  sigmaZM: 1.5,
  huberC: 0.1,
  maxIter: 12,
  lambda: 0.02,
  lambdaX: 0.012,
  lambdaZ: 0.045,
  lambdaDecay: 0.9,
  lambdaMin: 0.00005,
  minImprovement: 0.00005,
  nx: 22,
  nz: 12,
  hybridAlpha: 0.65,
  ...DEFAULT_RESIPY_WORKFLOW,
};

/** Método da inversão gaussiana original (contraste estável). */
export const PROXY_DEFAULT_METHOD: Dipolo2DInvertMethodId = "smoothness";

/** Alta qualidade (.dat / referência RES2DINV) — mais lento. */
export const PRECISION_RESIPY_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...RES2DINV_FAST_BASE,
  factorDepth: RESIPY_FMD_DEPTH_FACTOR,
  maxIter: 12,
  nx: 22,
  nz: 12,
  meshClFactor: 2,
  meshRefine: 0,
  contourSmoothPasses: 1,
  cropCorners: true,
  sensitivityOverlay: true,
};

/** Parâmetros para inversão blocky L1 (contraste geológico). */
export const BLOCKY_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...RES2DINV_INVERT_PARAMS,
};

/** Robusta L1 nos dados (menos contraste em ∇m que blocky). */
export const ROBUST_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...RES2DINV_FAST_BASE,
  lambda: 0.008,
  lambdaX: 0.006,
  lambdaZ: 0.02,
};

/** Sweep λ para teste (UI / diagnóstico). */
export const LAMBDA_TEST_VALUES = [1.0, 0.3, 0.1, 0.03] as const;

/** Suavizada L2 — padrão RES2DINV / camadas horizontais. */
export const RES2DINV_DEFAULT_METHOD: Dipolo2DInvertMethodId = "smoothness";

export const RES2DINV_PREFER_PHYSICS_ENGINE = true;

/** layer_smooth = camadas horizontais + interpolação contínua (export RES2DINV). */
export const RES2DINV_RENDER_MODE = "layer_smooth" as const;
export const HORIZONTAL_LAYERS_RENDER_MODE = "layer_smooth" as const;
export const HORIZONTAL_LAYERS_METHOD: Dipolo2DInvertMethodId = "smoothness";
export const RES2DINV_DISPLAY_SMOOTH_PASSES = 3;
/** Passes extra para preset camadas horizontais. */
export const HORIZONTAL_LAYERS_DISPLAY_SMOOTH_PASSES = 4;

export const RES2DINV_LOG_CONTRAST = "log_percentile" as const;
export const RES2DINV_FORWARD_MODEL = "fdm" as const;
export const DEFAULT_PHYSICS_BACKEND = "resipy" as const;

export const PHYSICS_BACKEND_OPTIONS: {
  id: import("./physics-invert-2d").PhysicsInvertEngineId;
  label: string;
  short: string;
}[] = [
  { id: "resipy", label: "ResIPy R2 (Binley)", short: "ResIPy" },
];

export const RES2DINV_INVERSION_NOTICE =
  "Inversão RES2DINV rápida: malha leve (cl×5), 5 it., Gauss-Newton L2, sem contour/crop.";

/** Escala fixa jet 0–7500 Ω·m — aba Results do ResIPy desktop. */
export const RESIPY_RESULTS_COLOR_SCALE: ResistivityColorScale = {
  auto: false,
  rhoMinOhmM: RESIPY_RESULTS_LEGEND_BREAKS_OHM[0],
  rhoMaxOhmM:
    RESIPY_RESULTS_LEGEND_BREAKS_OHM[RESIPY_RESULTS_LEGEND_BREAKS_OHM.length - 1],
  palette: "jet",
};

export const RESIPY_RESULTS_DISPLAY_SCALE: ModelDisplayScale = "linear";

/** Inversão + pós-processo alinhados ao ResIPy (contour + crop corners). */
export const RESIPY_RESULTS_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...PRECISION_RESIPY_INVERT_PARAMS,
  contourSmoothPasses: 2,
  cropCorners: true,
  sensitivityOverlay: false,
};

export const RESIPY_RESULTS_NOTICE =
  "Estilo ResIPy Results: jet 0–7500 Ω·m, contour, crop corners, trapézio, eixo Distance/Elevation.";

/** Inversão física alinhada ao RES2DINV desktop (GARUVA / .dat). */
export const RES2DINV_MATCH_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...PRECISION_RESIPY_INVERT_PARAMS,
  factorDepth: RESIPY_FMD_DEPTH_FACTOR,
  modelDepthFactor: RES2DINV_MODEL_DEPTH_FACTOR,
  modelDepthRange: RES2DINV_MODEL_DEPTH_RANGE,
  maxIter: 12,
  nx: 22,
  nz: 12,
  meshClFactor: 2,
  meshRefine: 0,
  contourSmoothPasses: 2,
  cropCorners: true,
  sensitivityOverlay: false,
};

/** Suavizada L2 — igual ao cabeçalho «Suavizada L2 (ResIPy R2)» da referência. */
export const RES2DINV_MATCH_METHOD: Dipolo2DInvertMethodId = "smoothness";

export const RES2DINV_MATCH_NOTICE =
  "Modelo RES2DINV: Suavizada L2, malha 22×12, classes 10–8000 Ω·m, trapézio Depth/Distance.";

export const HORIZONTAL_LAYERS_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...RES2DINV_MATCH_INVERT_PARAMS,
  lambda: 0.06,
  lambdaX: 0.03,
  lambdaZ: 1.15,
  minImprovement: 0.00025,
  maxIter: 12,
};

export const HORIZONTAL_LAYERS_NOTICE =
  "Camadas horizontais: Suavizada L2, λ_z alto, interpolação contínua (estilo RES2DINV).";

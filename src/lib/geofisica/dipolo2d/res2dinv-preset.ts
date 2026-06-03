/**
 * Presets calibrados para aproximar RES2DINV (log₁₀ ρ, GN/L1, λ baixo, malha fina).
 */
import {
  RES2DINV_COLOR_LEVELS,
  RES2DINV_FIXED_COLOR_SCALE,
} from "./res2dinv-colormap";
import type { Dipolo2DInvertMethodId, Dipolo2DInvertParams } from "./types";

export { RES2DINV_COLOR_LEVELS, RES2DINV_FIXED_COLOR_SCALE };

/** Inversão m=log₁₀(ρ); λ baixo + λ_z moderado (λ_z alto → modelo homogêneo). */
export const RES2DINV_INVERT_PARAMS: Dipolo2DInvertParams = {
  factorDepth: 0.286,
  sigmaXM: 3,
  sigmaZM: 1.5,
  lambda: 0.01,
  lambdaX: 0.01,
  lambdaZ: 0.05,
  huberC: 0.03,
  maxIter: 20,
  lambdaDecay: 0.9,
  lambdaMin: 0.005,
  minImprovement: 0.0002,
  nx: 40,
  nz: 22,
  hybridAlpha: 0,
};

/** Contraste forte: λ mínimo + L1 blocky (motor físico). */
export const BLOCKY_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...RES2DINV_INVERT_PARAMS,
  lambda: 0.03,
  lambdaX: 0.015,
  lambdaZ: 0.06,
  maxIter: 24,
};

/** Sweep λ para teste (UI / diagnóstico). */
export const LAMBDA_TEST_VALUES = [1.0, 0.3, 0.1, 0.03] as const;

/** blocky_l1 = máximo contraste (reiniciar motor); robust_l1 como fallback. */
export const RES2DINV_DEFAULT_METHOD: Dipolo2DInvertMethodId = "gauss_newton";

/** Motor físico obrigatório para inversão real (FDM + Jacobiana adjoint + GN + L1). */
export const RES2DINV_PREFER_PHYSICS_ENGINE = true;

/** Células discretas (evita suavizar contraste na visualização). */
export const RES2DINV_RENDER_MODE = "cells" as const;
/** 0 = sem blur visual (mais próximo do RES2DINV). */
export const RES2DINV_DISPLAY_SMOOTH_PASSES = 0;

/** Contraste fixo log₁₀ 1–5000 Ω·m + faixas discretas (legenda RES2DINV). */
export const RES2DINV_LOG_CONTRAST = "res2dinv" as const;

/** Motor forward para inversão física. */
export const RES2DINV_FORWARD_MODEL = "fdm" as const;

/** Texto curto após aplicar o preset completo. */
export const RES2DINV_INVERSION_NOTICE =
  "Inversão RES2DINV: Poisson FDM + Jacobiana (adjoint/FD), m=log₁₀(ρ), Robusta L1, λ_z>λ_x, topografia activa, exibição sem blur. Motor :8092 + npm run dev.";

/** Camadas horizontais nítidas: λ_z alto, λ_x baixo, inversão + interpolação lateral. */
export const HORIZONTAL_LAYERS_INVERT_PARAMS: Dipolo2DInvertParams = {
  ...RES2DINV_INVERT_PARAMS,
  lambda: 0.06,
  lambdaX: 0.03,
  lambdaZ: 1.15,
  minImprovement: 0.00025,
  maxIter: 28,
};

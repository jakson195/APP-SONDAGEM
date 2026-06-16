import type { Dipolo2DInvertMethodId } from "./types";

/** Métodos L2 suave — ResIPy redirecciona para blocky_l1. */
export const SMOOTH_LEAST_SQUARES_METHODS: ReadonlySet<Dipolo2DInvertMethodId> =
  new Set(["least_squares", "gauss_newton", "smoothness"]);

export const ROBUST_BLOCKY_METHODS: ReadonlySet<Dipolo2DInvertMethodId> =
  new Set(["robust_l1", "blocky_l1"]);

/** Padrão ResIPy: contraste geológico (blocky L1). */
export const PHYSICS_DEFAULT_INVERT_METHOD: Dipolo2DInvertMethodId = "blocky_l1";

/**
 * Motor físico (:8092): preserva o método escolhido na UI (ex.: smoothness = RES2DINV).
 */
export function resolvePhysicsInvertMethod(
  method: Dipolo2DInvertMethodId,
): Dipolo2DInvertMethodId {
  return method;
}

export function isRobustBlockyMethod(
  method: Dipolo2DInvertMethodId,
): boolean {
  return ROBUST_BLOCKY_METHODS.has(method);
}

export function physicsIrlsInnerIterations(
  method: Dipolo2DInvertMethodId,
): number {
  if (method === "blocky_l1") return 6;
  if (method === "robust_l1") return 4;
  return 2;
}

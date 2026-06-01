/**
 * Amostragem de modelo invertido 2D ao longo de uma linha ERT.
 */

import { bilinearLogRho } from "../dipolo2d/model-section-render";
import type { Dipolo2DInvertResult } from "../dipolo2d/types";

/** Converte distância ao longo da linha (m) + profundidade (m) → log₁₀(ρ). */
export function sampleInvertedSection(
  result: Dipolo2DInvertResult,
  stationM: number,
  depthM: number,
): number | null {
  const { mLog10, xEdgesM, zEdgesM, nx, nz } = result;
  const x0 = xEdgesM[0]!;
  const x1 = xEdgesM[nx] ?? xEdgesM[xEdgesM.length - 1]!;
  const z0 = zEdgesM[0]!;
  const zMax = zEdgesM[nz] ?? zEdgesM[zEdgesM.length - 1]!;

  if (stationM < x0 || stationM > x1 || depthM < z0 || depthM > zMax) {
    return null;
  }

  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = (zMax - z0) / Math.max(1, nz);
  const fi = (stationM - x0) / dx - 0.5;
  const fj = (depthM - z0) / dz - 0.5;

  if (fi < -0.5 || fi > nx - 0.5 || fj < -0.5 || fj > nz - 0.5) {
    return null;
  }

  return bilinearLogRho(mLog10, nx, nz, fi, fj);
}

/** log₁₀(ρ) → Ω·m. */
export function logRhoToOhmM(logRho: number): number {
  return Math.pow(10, logRho);
}

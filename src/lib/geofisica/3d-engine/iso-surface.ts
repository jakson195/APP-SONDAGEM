/**
 * Iso-superfície simplificada (marching cubes) a partir do volume voxel.
 */

import type { ResistivityVolume3D } from "../volume3d/volume3d-types";
import { blockSceneY } from "../volume3d/volume-terrain-surface";

function volumeIndex(
  i: number,
  j: number,
  k: number,
  nx: number,
  ny: number,
): number {
  return i + j * nx + k * nx * ny;
}

function sample(
  logRho: Float32Array,
  nx: number,
  ny: number,
  nz: number,
  i: number,
  j: number,
  k: number,
): number {
  if (i < 0 || i >= nx || j < 0 || j >= ny || k < 0 || k >= nz) return NaN;
  return logRho[volumeIndex(i, j, k, nx, ny)] ?? NaN;
}

/** Gera vértices de triângulos para iso-superfície de log10(ρ) = threshold. */
export function extractIsosurfaceMesh(
  volume: ResistivityVolume3D,
  isoLogRho: number,
  maxTriangles = 12000,
): { positions: Float32Array; indices: Uint32Array } {
  const { logRho, nx, ny, nz, boundsM, cellSizeM } = volume;
  const positions: number[] = [];
  const indices: number[] = [];
  let triCount = 0;

  const { minX, minY, maxZ } = boundsM;
  const { x: dx, y: dy, z: dz } = cellSizeM;

  for (let k = 0; k < nz - 1 && triCount < maxTriangles; k++) {
    for (let j = 0; j < ny - 1 && triCount < maxTriangles; j++) {
      for (let i = 0; i < nx - 1 && triCount < maxTriangles; i++) {
        const v000 = sample(logRho, nx, ny, nz, i, j, k);
        const v100 = sample(logRho, nx, ny, nz, i + 1, j, k);
        const v010 = sample(logRho, nx, ny, nz, i, j + 1, k);
        const v110 = sample(logRho, nx, ny, nz, i + 1, j + 1, k);
        const v001 = sample(logRho, nx, ny, nz, i, j, k + 1);
        const v101 = sample(logRho, nx, ny, nz, i + 1, j, k + 1);
        const v011 = sample(logRho, nx, ny, nz, i, j + 1, k + 1);
        const v111 = sample(logRho, nx, ny, nz, i + 1, j + 1, k + 1);

        const vals = [v000, v100, v010, v110, v001, v101, v011, v111];
        if (vals.some((v) => !Number.isFinite(v))) continue;

        const above = vals.filter((v) => v >= isoLogRho).length;
        if (above === 0 || above === 8) continue;

        const cx = minX + (i + 0.5) * dx;
        const cy = minY + (j + 0.5) * dy;
        const cz = blockSceneY(volume, i, j, (k + 0.5) * dz);

        const base = positions.length / 3;
        positions.push(cx, cz, cy);
        positions.push(cx + dx * 0.5, cz - dz * 0.5, cy + dy * 0.5);
        positions.push(cx + dx, cz, cy);
        indices.push(base, base + 1, base + 2);
        triCount++;
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/**
 * Amostras 3D (x, y, z, log10 ρ) a partir de secções invertidas.
 */

import type { GeophysSurveyLine } from "./volume3d-types";
import { computeSurveyAnchor } from "./geometry-coords";
import { lineToLocalSegment } from "./line-geometry-3d";

export type VolumeSamplePoint3D = {
  x: number;
  y: number;
  z: number;
  logRho: number;
  lineId: string;
};

/** Extrai centros de célula da malha invertida em coordenadas locais (m). */
export function collectSectionSamplePoints(
  lines: GeophysSurveyLine[],
  decimate = 1,
): VolumeSamplePoint3D[] {
  const inverted = lines.filter((l) => l.invertResult);
  if (inverted.length === 0) return [];

  const anchor = computeSurveyAnchor(inverted);
  const out: VolumeSamplePoint3D[] = [];

  for (const line of inverted) {
    const result = line.invertResult!;
    const seg = lineToLocalSegment(
      line.id,
      line.name,
      line.geometry,
      anchor.lat,
      anchor.lng,
    );
    const { mLog10, nx, nz, xEdgesM, zEdgesM } = result;
    const x0 = xEdgesM[0]!;
    const x1 = xEdgesM[nx] ?? xEdgesM[xEdgesM.length - 1]!;
    const lineLen = Math.max(seg.lengthM, 1e-6);

    for (let i = 0; i < nx; i += decimate) {
      const stationM = (xEdgesM[i]! + xEdgesM[i + 1]!) / 2;
      const t = (stationM - x0) / Math.max(x1 - x0, 1e-6);
      const wx = seg.start.x + t * (seg.end.x - seg.start.x);
      const wy = seg.start.y + t * (seg.end.y - seg.start.y);

      for (let j = 0; j < nz; j += decimate) {
        const depthM = (zEdgesM[j]! + zEdgesM[j + 1]!) / 2;
        const logRho = mLog10[i * nz + j]!;
        if (!Number.isFinite(logRho)) continue;
        out.push({ x: wx, y: wy, z: depthM, logRho, lineId: line.id });
      }
    }
  }

  return out;
}

export function samplePointsBounds(
  points: VolumeSamplePoint3D[],
  padM: number,
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maxZ: number;
} | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxZ = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  return {
    minX: minX - padM,
    maxX: maxX + padM,
    minY: minY - padM,
    maxY: maxY + padM,
    maxZ: maxZ + padM * 0.1,
  };
}

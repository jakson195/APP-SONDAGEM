/**
 * Converte nuvem XYZ (X Y Z resistividade) em amostras 3D para interpolação voxel.
 */

import { latLngToLocalM } from "@/lib/hydraulic-interpolation";
import type { VolumeSamplePoint3D } from "./collect-section-samples";
import type { XyzParseResult } from "./parse-xyz";

function inferDepthM(z: number, zMin: number, zMax: number): number {
  const span = zMax - zMin;
  if (span <= 0) return Math.max(0, z);
  // Valores pequenos → profundidade; valores grandes → cota/elevação relativa
  if (zMax <= 300 && zMin >= -10) return Math.max(0, z);
  return Math.max(0, zMax - z);
}

/** XYZ geográfico ou métrico → amostras locais (x, y, profundidade, log₁₀ ρ). */
export function xyzParseToVolumeSamples(
  parsed: XyzParseResult,
  anchorLat: number,
  anchorLng: number,
  lineId = "xyz-cloud",
): VolumeSamplePoint3D[] {
  if (parsed.points.length === 0) return [];

  const zValues = parsed.points.map((p) => p.z);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);

  const out: VolumeSamplePoint3D[] = [];
  for (const p of parsed.points) {
    let xLocal: number;
    let yLocal: number;

    if (parsed.isGeographic) {
      const local = latLngToLocalM(anchorLat, anchorLng, p.y, p.x);
      xLocal = local.x;
      yLocal = local.y;
    } else {
      xLocal = p.x;
      yLocal = p.y;
    }

    const depthM = inferDepthM(p.z, zMin, zMax);
    const logRho = parsed.valueIsLog10
      ? p.value
      : Math.log10(Math.max(p.value, 1e-6));

    if (!Number.isFinite(logRho)) continue;
    out.push({ x: xLocal, y: yLocal, z: depthM, logRho, lineId });
  }
  return out;
}

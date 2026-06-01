/**
 * Constrói volume 3D pseudo-georreferenciado a partir de 2+ secções invertidas.
 * Interpola entre linhas por IDW no plano horizontal.
 */

import type {
  GeophysSurveyLine,
  ResistivityVolume3D,
  VolumeBuildParams,
} from "./volume3d-types";
import { computeSurveyAnchor } from "./geometry-coords";
import {
  boundsFromLineSegments,
  lineToLocalSegment,
  projectPointOnSegment,
  type LineSegmentLocal,
} from "./line-geometry-3d";
import { sampleInvertedSection } from "./sample-section";

function volumeIndex(i: number, j: number, k: number, nx: number, ny: number): number {
  return i + j * nx + k * nx * ny;
}

function idwBlend(
  samples: { value: number; distM: number }[],
  power: number,
): number | null {
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0]!.value;

  let num = 0;
  let den = 0;
  for (const s of samples) {
    const d = Math.max(s.distM, 0.5);
    const w = 1 / Math.pow(d, power);
    num += w * s.value;
    den += w;
  }
  return den > 0 ? num / den : null;
}

/** Garante extensão mínima do envelope (linhas coincidentes ou muito curtas). */
function expandBoundsMinSpan(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  minSpanM = 30,
): void {
  const spanX = bounds.maxX - bounds.minX;
  if (spanX < minSpanM) {
    const cx = (bounds.maxX + bounds.minX) / 2;
    bounds.minX = cx - minSpanM / 2;
    bounds.maxX = cx + minSpanM / 2;
  }
  const spanY = bounds.maxY - bounds.minY;
  if (spanY < minSpanM) {
    const cy = (bounds.maxY + bounds.minY) / 2;
    bounds.minY = cy - minSpanM / 2;
    bounds.maxY = cy + minSpanM / 2;
  }
}

export function countValidVolumeCells(volume: ResistivityVolume3D): number {
  let n = 0;
  for (const v of volume.logRho) {
    if (Number.isFinite(v)) n++;
  }
  return n;
}

function nearestBlend(samples: { value: number; distM: number }[]): number | null {
  if (samples.length === 0) return null;
  let best = samples[0]!;
  for (const s of samples) {
    if (s.distM < best.distM) best = s;
  }
  return best.value;
}

/** Mapeia posição normalizada ao longo da linha (t) → estação da malha invertida. */
function stationMForProjection(
  _alongM: number,
  t: number,
  result: NonNullable<GeophysSurveyLine["invertResult"]>,
): number {
  const x0 = result.xEdgesM[0]!;
  const x1 = result.xEdgesM[result.nx] ?? result.xEdgesM[result.xEdgesM.length - 1]!;
  return x0 + t * (x1 - x0);
}

export function buildResistivityVolume3D(
  lines: GeophysSurveyLine[],
  params: VolumeBuildParams,
): ResistivityVolume3D | null {
  const inverted = lines.filter((l) => l.invertResult);
  if (inverted.length < 2) return null;

  const anchor = computeSurveyAnchor(inverted);
  const segments: LineSegmentLocal[] = inverted.map((l) =>
    lineToLocalSegment(l.id, l.name, l.geometry, anchor.lat, anchor.lng),
  );

  const padM = Math.max(20, params.maxInfluenceM * 0.5);
  const bounds = boundsFromLineSegments(segments, padM);
  if (!bounds) return null;
  expandBoundsMinSpan(bounds);

  const { nx, ny, nz, zMaxM } = params;
  const dx = (bounds.maxX - bounds.minX) / nx;
  const dy = (bounds.maxY - bounds.minY) / ny;
  const dz = zMaxM / nz;

  const logRho = new Float32Array(nx * ny * nz);
  logRho.fill(NaN);

  for (let k = 0; k < nz; k++) {
    const depthM = (k + 0.5) * dz;
    for (let j = 0; j < ny; j++) {
      const py = bounds.minY + (j + 0.5) * dy;
      for (let i = 0; i < nx; i++) {
        const px = bounds.minX + (i + 0.5) * dx;
        const samples: { value: number; distM: number }[] = [];

        for (let li = 0; li < inverted.length; li++) {
          const line = inverted[li]!;
          const seg = segments[li]!;
          const proj = projectPointOnSegment(
            px,
            py,
            seg.start.x,
            seg.start.y,
            seg.end.x,
            seg.end.y,
          );

          if (proj.perpDistM > params.maxInfluenceM) continue;

          const stationM = stationMForProjection(
            proj.alongM,
            proj.t,
            line.invertResult!,
          );
          const logVal = sampleInvertedSection(
            line.invertResult!,
            stationM,
            depthM,
          );
          if (logVal != null && Number.isFinite(logVal)) {
            samples.push({ value: logVal, distM: proj.perpDistM });
          }
        }

        const blended =
          params.interpMethod === "nearest"
            ? nearestBlend(samples)
            : idwBlend(samples, params.idwPower);

        if (blended != null) {
          logRho[volumeIndex(i, j, k, nx, ny)] = blended;
        }
      }
    }
  }

  return {
    logRho,
    nx,
    ny,
    nz,
    originM: { x: bounds.minX, y: bounds.minY },
    cellSizeM: { x: dx, y: dy, z: dz },
    boundsM: {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: bounds.minY,
      maxY: bounds.maxY,
      maxZ: zMaxM,
    },
    anchorLat: anchor.lat,
    anchorLng: anchor.lng,
    lineIds: inverted.map((l) => l.id),
  };
}

/** Extrai fatia horizontal (k) como Float32Array nx×ny. */
export function extractHorizontalSlice(
  volume: ResistivityVolume3D,
  depthIndex: number,
): Float32Array {
  const { nx, ny, nz, logRho } = volume;
  const k = Math.max(0, Math.min(nz - 1, depthIndex));
  const slice = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      slice[i + j * nx] = logRho[volumeIndex(i, j, k, nx, ny)] ?? NaN;
    }
  }
  return slice;
}

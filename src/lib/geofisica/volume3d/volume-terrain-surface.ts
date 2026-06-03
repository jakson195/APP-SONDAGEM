/**
 * Superfície do terreno (DEM / topografia de perfil) para o volume 3D.
 * Interpola cotas ao longo das linhas ERT e posiciona blocos abaixo do terreno real.
 */

import { interpolateTopographyAt } from "../dipolo2d/parse-topography";
import type {
  GeophysSurveyLine,
  ResistivityVolume3D,
  VolumeBuildParams,
} from "./volume3d-types";
import {
  lineToLocalSegment,
  projectPointOnSegment,
  type LineSegmentLocal,
} from "./line-geometry-3d";
import { fetchDemSurfaceGridForVolume } from "./volume-terrain-dem-grid";

function surfaceIndex(i: number, j: number, nx: number): number {
  return i + j * nx;
}

function idwBlend(
  samples: { value: number; distM: number }[],
  power = 2,
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

/** Linha tem cotas utilizáveis (perfil DEM ou A/B). */
export function lineHasTerrainData(line: GeophysSurveyLine): boolean {
  if (line.topography && line.topography.length >= 2) return true;
  const { start, end } = line.geometry;
  return (
    Number.isFinite(start.z) &&
    Number.isFinite(end.z) &&
    (start.z !== 0 || end.z !== 0)
  );
}

export function surveyHasTerrainData(lines: GeophysSurveyLine[]): boolean {
  return lines.some(lineHasTerrainData);
}

/** Linhas com topografia de perfil importada (≥2 pontos dist/cota). */
export function surveyHasProfileTopography(lines: GeophysSurveyLine[]): boolean {
  return lines.some((l) => (l.topography?.length ?? 0) >= 2);
}

export function countProfileTopographyLines(lines: GeophysSurveyLine[]): number {
  return lines.filter((l) => (l.topography?.length ?? 0) >= 2).length;
}

function elevationAlongLine(
  line: GeophysSurveyLine,
  alongM: number,
  lengthM: number,
): number | null {
  if (line.topography && line.topography.length >= 2) {
    return interpolateTopographyAt(line.topography, alongM);
  }
  const { start, end } = line.geometry;
  if (Number.isFinite(start.z) && Number.isFinite(end.z)) {
    const t = lengthM > 0 ? Math.max(0, Math.min(1, alongM / lengthM)) : 0;
    return start.z + t * (end.z - start.z);
  }
  return null;
}

function fillSurfaceHoles(surface: Float32Array, nx: number, ny: number): void {
  let sum = 0;
  let count = 0;
  for (const v of surface) {
    if (Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  if (count === 0) return;
  const fallback = sum / count;

  for (let pass = 0; pass < 8; pass++) {
    let filled = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = surfaceIndex(i, j, nx);
        if (Number.isFinite(surface[idx]!)) continue;

        const neighbors: number[] = [];
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || ni >= nx || nj < 0 || nj >= ny) continue;
            const v = surface[surfaceIndex(ni, nj, nx)]!;
            if (Number.isFinite(v)) neighbors.push(v);
          }
        }
        if (neighbors.length > 0) {
          surface[idx] = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
          filled++;
        }
      }
    }
    if (filled === 0) break;
  }

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = surfaceIndex(i, j, nx);
      if (!Number.isFinite(surface[idx]!)) surface[idx] = fallback;
    }
  }
}

/** Grelha nx×ny de cota superficial (m ASL) a partir das linhas georreferenciadas. */
export function buildVolumeTerrainSurface(
  lines: GeophysSurveyLine[],
  volume: Pick<
    ResistivityVolume3D,
    "nx" | "ny" | "boundsM" | "cellSizeM" | "anchorLat" | "anchorLng"
  >,
  maxInfluenceM: number,
): { surfaceM: Float32Array; surfaceRefM: number } | null {
  const withTerrain = lines.filter(lineHasTerrainData);
  if (withTerrain.length === 0) return null;

  const { nx, ny, boundsM } = volume;
  const segments: LineSegmentLocal[] = withTerrain.map((l) =>
    lineToLocalSegment(l.id, l.name, l.geometry, volume.anchorLat, volume.anchorLng),
  );

  const surface = new Float32Array(nx * ny);
  surface.fill(NaN);

  for (let j = 0; j < ny; j++) {
    const py = boundsM.minY + (j + 0.5) * volume.cellSizeM.y;
    for (let i = 0; i < nx; i++) {
      const px = boundsM.minX + (i + 0.5) * volume.cellSizeM.x;
      const samples: { value: number; distM: number }[] = [];

      for (let li = 0; li < withTerrain.length; li++) {
        const line = withTerrain[li]!;
        const seg = segments[li]!;
        const proj = projectPointOnSegment(
          px,
          py,
          seg.start.x,
          seg.start.y,
          seg.end.x,
          seg.end.y,
        );
        if (proj.perpDistM > maxInfluenceM) continue;

        const elev = elevationAlongLine(line, proj.alongM, seg.lengthM);
        if (elev != null && Number.isFinite(elev)) {
          samples.push({ value: elev, distM: proj.perpDistM });
        }
      }

      const blended = idwBlend(samples);
      if (blended != null) {
        surface[surfaceIndex(i, j, nx)] = blended;
      }
    }
  }

  fillSurfaceHoles(surface, nx, ny);

  let sum = 0;
  for (const v of surface) sum += v;
  const surfaceRefM = sum / surface.length;

  return { surfaceM: surface, surfaceRefM };
}

export function attachTerrainSurfaceToVolume(
  volume: ResistivityVolume3D,
  lines: GeophysSurveyLine[],
  params: Pick<VolumeBuildParams, "maxInfluenceM" | "followTerrain">,
): ResistivityVolume3D {
  if (params.followTerrain === false) return volume;
  if (!surveyHasTerrainData(lines)) return volume;

  const terrain = buildVolumeTerrainSurface(lines, volume, params.maxInfluenceM);
  if (!terrain) return volume;

  return {
    ...volume,
    surfaceM: terrain.surfaceM,
    surfaceRefM: terrain.surfaceRefM,
    followTerrain: true,
  };
}

/** Obtém terreno para o volume: perfil importado tem prioridade; DEM só como fallback. */
export async function attachTerrainSurfaceToVolumeAsync(
  volume: ResistivityVolume3D,
  lines: GeophysSurveyLine[],
  params: Pick<VolumeBuildParams, "maxInfluenceM" | "followTerrain">,
): Promise<ResistivityVolume3D> {
  if (params.followTerrain === false) return volume;

  if (surveyHasProfileTopography(lines)) {
    const profileTerrain = buildVolumeTerrainSurface(
      lines,
      volume,
      params.maxInfluenceM,
    );
    if (profileTerrain) {
      return {
        ...volume,
        surfaceM: profileTerrain.surfaceM,
        surfaceRefM: profileTerrain.surfaceRefM,
        followTerrain: true,
      };
    }
  }

  try {
    const demGrid = await fetchDemSurfaceGridForVolume(volume);
    if (!demGrid) {
      return attachTerrainSurfaceToVolume(volume, lines, params);
    }
    const lineTerrain = surveyHasTerrainData(lines)
      ? buildVolumeTerrainSurface(lines, volume, params.maxInfluenceM)
      : null;

    const surfaceM =
      lineTerrain != null
        ? blendLineTerrainIntoDemGrid(
            demGrid.surfaceM,
            lineTerrain.surfaceM,
            volume.nx,
            volume.ny,
            0.65,
          )
        : demGrid.surfaceM;

    return {
      ...volume,
      surfaceM,
      surfaceRefM: demGrid.surfaceRefM,
      followTerrain: true,
    };
  } catch {
    return attachTerrainSurfaceToVolume(volume, lines, params);
  }
}

/** Refina o DEM com topografia de perfil (peso 0–1 nas células com perfil). */
function blendLineTerrainIntoDemGrid(
  dem: Float32Array,
  lineSurf: Float32Array,
  nx: number,
  ny: number,
  lineWeight: number,
): Float32Array {
  const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = i + j * nx;
      const d = dem[idx]!;
      const l = lineSurf[idx]!;
      if (!Number.isFinite(l)) {
        out[idx] = d;
        continue;
      }
      if (!Number.isFinite(d)) {
        out[idx] = l;
        continue;
      }
      out[idx] = d * (1 - lineWeight) + l * lineWeight;
    }
  }
  return out;
}

export function surfaceAtGridIndex(
  volume: ResistivityVolume3D,
  i: number,
  j: number,
): number | null {
  if (!volume.surfaceM || volume.surfaceRefM == null) return null;
  const v = volume.surfaceM[surfaceIndex(i, j, volume.nx)];
  return Number.isFinite(v) ? v! : null;
}

/** Cota relativa à referência da cena (Y=0 ≈ cota média). */
export function surfaceSceneY(
  volume: ResistivityVolume3D,
  i: number,
  j: number,
): number {
  const elev = surfaceAtGridIndex(volume, i, j);
  if (elev == null || volume.surfaceRefM == null) return 0;
  return elev - volume.surfaceRefM;
}

/** Interpolação bilinear da superfície em coordenadas locais (m). */
export function surfaceAtXY(
  volume: ResistivityVolume3D,
  xM: number,
  yM: number,
): number | null {
  if (!volume.surfaceM || volume.surfaceRefM == null) return null;
  const { nx, ny, boundsM, cellSizeM } = volume;
  const fx = (xM - boundsM.minX) / cellSizeM.x - 0.5;
  const fy = (yM - boundsM.minY) / cellSizeM.y - 0.5;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;

  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const i1 = Math.min(nx - 1, i0 + 1);
  const j1 = Math.min(ny - 1, j0 + 1);
  const tx = fx - i0;
  const ty = fy - j0;

  const v00 = volume.surfaceM[surfaceIndex(i0, j0, nx)]!;
  const v10 = volume.surfaceM[surfaceIndex(i1, j0, nx)]!;
  const v01 = volume.surfaceM[surfaceIndex(i0, j1, nx)]!;
  const v11 = volume.surfaceM[surfaceIndex(i1, j1, nx)]!;
  if (![v00, v10, v01, v11].every(Number.isFinite)) return null;

  const v0 = v00 + tx * (v10 - v00);
  const v1 = v01 + tx * (v11 - v01);
  return v0 + ty * (v1 - v0);
}

export function surfaceSceneYAtXY(
  volume: ResistivityVolume3D,
  xM: number,
  yM: number,
): number {
  const elev = surfaceAtXY(volume, xM, yM);
  if (elev == null || volume.surfaceRefM == null) return 0;
  return elev - volume.surfaceRefM;
}

/** Posição Y na cena Three.js para o centro de um bloco (profundidade abaixo da superfície). */
export function blockSceneY(
  volume: ResistivityVolume3D,
  i: number,
  j: number,
  depthCenterM: number,
): number {
  return surfaceSceneY(volume, i, j) - depthCenterM;
}

/**
 * Modelo de blocos 3D a partir do voxel grid interpolado.
 */

import {
  applyLogBoundsScale,
  defaultColorScale,
  paletteColor,
  type ResistivityColorScale,
} from "../dipolo2d/colormap";
import type { ResistivityVolume3D } from "../volume3d/volume3d-types";
import { blockSceneY } from "../volume3d/volume-terrain-surface";
import type { VolumeRhoFilter } from "../volume3d/volume-rho-filter";

export type BlockModelCell = {
  i: number;
  j: number;
  k: number;
  xM: number;
  yM: number;
  zTopM: number;
  zBottomM: number;
  surfaceM: number | null;
  elevationTopM: number | null;
  elevationBottomM: number | null;
  logRho: number;
  rhoOhmM: number;
};

export type BlockModelBuildOptions = {
  logLo: number;
  logHi: number;
  decimate?: number;
  clipDepthM?: number | null;
  colorScale?: ResistivityColorScale;
  /** Escala visual do bloco (0.95 = gap entre blocos). */
  blockGap?: number;
  /** Filtro Ω·m — células fora da faixa são omitidas (transparentes). */
  rhoMinOhmM?: number | null;
  rhoMaxOhmM?: number | null;
  rhoFilterEnabled?: boolean;
};

function volumeIndex(
  i: number,
  j: number,
  k: number,
  nx: number,
  ny: number,
): number {
  return i + j * nx + k * nx * ny;
}

/** Lista células válidas do voxel grid. */
export function enumerateBlockCells(
  volume: ResistivityVolume3D,
  options: BlockModelBuildOptions,
): BlockModelCell[] {
  const { nx, ny, nz, logRho, boundsM, cellSizeM } = volume;
  const dec = Math.max(1, options.decimate ?? 1);
  const clipZ = options.clipDepthM;
  const cells: BlockModelCell[] = [];

  for (let k = 0; k < nz; k += dec) {
    const zTopM = k * cellSizeM.z;
    const zBottomM = (k + 1) * cellSizeM.z;
    if (clipZ != null && zTopM >= clipZ) continue;

    for (let j = 0; j < ny; j += dec) {
      for (let i = 0; i < nx; i += dec) {
        const v = logRho[volumeIndex(i, j, k, nx, ny)]!;
        if (!Number.isFinite(v)) continue;

        const rhoOhmM = 10 ** v;
        if (options.rhoFilterEnabled) {
          const lo = options.rhoMinOhmM;
          const hi = options.rhoMaxOhmM;
          if (lo != null && rhoOhmM < lo) continue;
          if (hi != null && rhoOhmM > hi) continue;
        }

        const surfaceM =
          volume.surfaceM && volume.surfaceRefM != null
            ? (volume.surfaceM[i + j * nx] ?? null)
            : null;
        const elevTop =
          surfaceM != null && Number.isFinite(surfaceM)
            ? surfaceM - zTopM
            : null;
        const elevBottom =
          surfaceM != null && Number.isFinite(surfaceM)
            ? surfaceM - zBottomM
            : null;

        cells.push({
          i,
          j,
          k,
          xM: boundsM.minX + (i + 0.5) * cellSizeM.x,
          yM: boundsM.minY + (j + 0.5) * cellSizeM.y,
          zTopM,
          zBottomM,
          surfaceM:
            surfaceM != null && Number.isFinite(surfaceM) ? surfaceM : null,
          elevationTopM: elevTop,
          elevationBottomM: elevBottom,
          logRho: v,
          rhoOhmM: 10 ** v,
        });
      }
    }
  }
  return cells;
}

export type BlockInstanceBuffers = {
  count: number;
  /** Centro de cada bloco: x, y, z (Y negativo = profundidade). */
  centers: Float32Array;
  /** RGB 0–1 por instância. */
  colors: Float32Array;
  /** Escala dx, dy, dz por instância. */
  scales: Float32Array;
};

export function buildBlockInstanceBuffers(
  volume: ResistivityVolume3D,
  options: BlockModelBuildOptions,
): BlockInstanceBuffers {
  const cells = enumerateBlockCells(volume, options);
  const { logLo, logHi } = applyLogBoundsScale(
    options.logLo,
    options.logHi,
    options.colorScale ?? defaultColorScale,
  );
  const gap = options.blockGap ?? 0.92;
  const { cellSizeM } = volume;
  const sx = cellSizeM.x * gap * (options.decimate ?? 1);
  const sy = cellSizeM.z * gap * (options.decimate ?? 1);
  const sz = cellSizeM.y * gap * (options.decimate ?? 1);

  const count = cells.length;
  const centers = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);

  for (let n = 0; n < count; n++) {
    const c = cells[n]!;
    const depthCenter = (c.zTopM + c.zBottomM) / 2;
    centers[n * 3] = c.xM;
    centers[n * 3 + 1] = blockSceneY(volume, c.i, c.j, depthCenter);
    centers[n * 3 + 2] = c.yM;

    scales[n * 3] = sx;
    scales[n * 3 + 1] = sy;
    scales[n * 3 + 2] = sz;

    const t = Math.max(
      0,
      Math.min(1, (c.logRho - logLo) / Math.max(logHi - logLo, 1e-6)),
    );
    const levels = 24;
    const tQ = Math.round(t * (levels - 1)) / Math.max(1, levels - 1);
    const [r, g, b] = paletteColor(
      (options.colorScale ?? defaultColorScale).palette,
      tQ,
    );
    colors[n * 3] = r / 255;
    colors[n * 3 + 1] = g / 255;
    colors[n * 3 + 2] = b / 255;
  }

  return { count, centers, colors, scales };
}

/** Export CSV estilo block model (centro + ρ). */
export function exportBlockModelCsv(
  volume: ResistivityVolume3D,
  options: BlockModelBuildOptions,
): string {
  const cells = enumerateBlockCells(volume, options);
  const withTerrain = cells.some((c) => c.surfaceM != null);
  const header = withTerrain
    ? "i,j,k,x_m,y_m,z_top_m,z_bottom_m,surface_m,elev_top_m,elev_bottom_m,log10_rho,rho_ohm_m"
    : "i,j,k,x_m,y_m,z_top_m,z_bottom_m,log10_rho,rho_ohm_m";
  const lines = [
    header,
    ...cells.map((c) => {
      const base = `${c.i},${c.j},${c.k},${c.xM.toFixed(3)},${c.yM.toFixed(3)},${c.zTopM.toFixed(3)},${c.zBottomM.toFixed(3)}`;
      const terrain = withTerrain
        ? `,${c.surfaceM != null ? c.surfaceM.toFixed(3) : ""},${c.elevationTopM != null ? c.elevationTopM.toFixed(3) : ""},${c.elevationBottomM != null ? c.elevationBottomM.toFixed(3) : ""}`
        : "";
      return `${base}${terrain},${c.logRho.toFixed(4)},${c.rhoOhmM.toFixed(2)}`;
    }),
  ];
  return lines.join("\n");
}

export function blockModelSummary(volume: ResistivityVolume3D): {
  totalCells: number;
  validCells: number;
  blockSizeM: { x: number; y: number; z: number };
} {
  const total = volume.nx * volume.ny * volume.nz;
  let valid = 0;
  for (const v of volume.logRho) {
    if (Number.isFinite(v)) valid++;
  }
  return {
    totalCells: total,
    validCells: valid,
    blockSizeM: { ...volume.cellSizeM },
  };
}

export type RhoBandVolumeStats = {
  cellCount: number;
  validCellCount: number;
  volumeM3: number;
  volumeTotalM3: number;
  fractionPercent: number;
  meanRhoOhmM: number;
  cellVolumeM3: number;
};

/** Volume (m³) dos voxels válidos dentro da faixa ρ; ignora decimação visual. */
export function computeRhoBandVolumeStats(
  volume: ResistivityVolume3D,
  filter: VolumeRhoFilter,
  clipDepthM: number | null = null,
): RhoBandVolumeStats {
  const { nx, ny, nz, logRho, cellSizeM } = volume;
  const cellVolumeM3 = cellSizeM.x * cellSizeM.y * cellSizeM.z;

  let validCellCount = 0;
  let cellCount = 0;
  let rhoSum = 0;

  for (let k = 0; k < nz; k++) {
    const zTopM = k * cellSizeM.z;
    if (clipDepthM != null && zTopM >= clipDepthM) continue;

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = logRho[volumeIndex(i, j, k, nx, ny)]!;
        if (!Number.isFinite(v)) continue;

        validCellCount++;
        const rhoOhmM = 10 ** v;

        if (filter.enabled) {
          if (rhoOhmM < filter.rhoMinOhmM || rhoOhmM > filter.rhoMaxOhmM) {
            continue;
          }
        }

        cellCount++;
        rhoSum += rhoOhmM;
      }
    }
  }

  const volumeM3 = cellCount * cellVolumeM3;
  const volumeTotalM3 = validCellCount * cellVolumeM3;

  return {
    cellCount,
    validCellCount,
    volumeM3,
    volumeTotalM3,
    fractionPercent:
      volumeTotalM3 > 0 ? (volumeM3 / volumeTotalM3) * 100 : 0,
    meanRhoOhmM: cellCount > 0 ? rhoSum / cellCount : 0,
    cellVolumeM3,
  };
}

export function formatVolumeM3(m3: number): string {
  if (!Number.isFinite(m3) || m3 <= 0) return "0 m³";
  const abs = Math.abs(m3);
  if (abs >= 1_000_000) {
    return `${(m3 / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ×10⁶ m³`;
  }
  if (abs >= 10_000) {
    return `${(m3 / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ×10³ m³`;
  }
  return `${m3.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m³`;
}

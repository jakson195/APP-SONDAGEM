import type {
  SpectralIndex,
  TemporalChangeAnalysis,
  TemporalChangePixel,
  Wgs84Bbox,
} from "./temporal-types";
import {
  bandsToDisplayRgb,
  buildSyntheticBandsAt,
  computeSpectralIndex,
  indexToRgb,
} from "./spectral-indices";

export type RasterGrid = {
  nx: number;
  ny: number;
  /** Valores por índice em cada célula */
  values: Float32Array;
  bounds: Wgs84Bbox;
};

export function buildSyntheticIndexGrid(
  bounds: Wgs84Bbox,
  nx: number,
  ny: number,
  index: SpectralIndex,
  seed: number,
  year = 2000,
): RasterGrid {
  const values = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / Math.max(nx - 1, 1);
      const v = j / Math.max(ny - 1, 1);
      const bands = buildSyntheticBandsAt(u, v, seed, year);
      values[i + j * nx] = computeSpectralIndex(index, bands);
    }
  }
  return { nx, ny, values, bounds };
}

export function hashTemporalDate(d: string): number {
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Pré-visualização demo do índice espectral por data (varia com o ano). */
export function indexGridToDataUrl(
  date: string,
  index: SpectralIndex,
  bounds: Wgs84Bbox,
  nx = 96,
  ny = 96,
): string {
  if (typeof document === "undefined") return "";
  const year = Number(date.slice(0, 4)) || 2000;
  const seed = hashTemporalDate(date) + year * 31;
  const canvas = document.createElement("canvas");
  canvas.width = nx;
  canvas.height = ny;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(nx, ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / Math.max(nx - 1, 1);
      const v = j / Math.max(ny - 1, 1);
      const bands = buildSyntheticBandsAt(u, v, seed, year);
      const [r, g, b] = bandsToDisplayRgb(index, bands);
      const o = (j * nx + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] =
        index === "rgb" || index === "false_color" || index === "grayscale"
          ? 255
          : 210;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function computeChangeAnalysis(
  gridA: RasterGrid,
  gridB: RasterGrid,
  dateA: string,
  dateB: string,
  index: SpectralIndex,
  changeThreshold = 0.12,
): TemporalChangeAnalysis {
  const nx = Math.min(gridA.nx, gridB.nx);
  const ny = Math.min(gridA.ny, gridB.ny);
  const heatValues = new Array<number>(nx * ny);
  let changed = 0;
  let sumDelta = 0;
  const hotspots: TemporalChangePixel[] = [];

  const { west, south, east, north } = gridA.bounds;
  const dLng = (east - west) / nx;
  const dLat = (north - south) / ny;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = i + j * nx;
      const a = gridA.values[idx] ?? 0;
      const b = gridB.values[idx] ?? 0;
      const delta = Math.abs(b - a);
      heatValues[idx] = delta;
      sumDelta += delta;
      if (delta >= changeThreshold) {
        changed++;
        if (hotspots.length < 48 && delta >= changeThreshold * 1.8) {
          hotspots.push({
            lat: south + (j + 0.5) * dLat,
            lng: west + (i + 0.5) * dLng,
            magnitude: delta,
            confidence: Math.min(1, delta / (changeThreshold * 3)),
          });
        }
      }
    }
  }

  const total = nx * ny;
  return {
    dateA,
    dateB,
    index,
    changePct: total > 0 ? (changed / total) * 100 : 0,
    meanDelta: total > 0 ? sumDelta / total : 0,
    hotspots: hotspots.sort((x, y) => y.magnitude - x.magnitude),
    heatmapGrid: {
      nx,
      ny,
      values: heatValues,
      bounds: gridA.bounds,
    },
  };
}

/** Renderiza grelha de mudança como PNG data URL (heatmap). */
export function changeGridToDataUrl(
  grid: TemporalChangeAnalysis["heatmapGrid"],
  index: SpectralIndex,
): string {
  const { nx, ny, values } = grid;
  const canvas = document.createElement("canvas");
  canvas.width = nx;
  canvas.height = ny;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(nx, ny);
  let maxV = 0;
  for (const v of values) maxV = Math.max(maxV, v);
  maxV = maxV || 1;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = (values[i + j * nx] ?? 0) / maxV;
      const [r, g, b] = indexToRgb(index, v * 2 - 1);
      const o = (j * nx + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = v > 0.05 ? 200 : 40;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function autoDetectChangeDates(
  scenes: { date: string; cloudCoverPct?: number }[],
): { dateA: string; dateB: string } | null {
  const sorted = [...scenes].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const clear = sorted.filter((s) => (s.cloudCoverPct ?? 100) < 30);
  const pool = clear.length >= 2 ? clear : sorted;
  return {
    dateA: pool[0]!.date,
    dateB: pool[pool.length - 1]!.date,
  };
}

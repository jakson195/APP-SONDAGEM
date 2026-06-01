/**
 * Cliente HTTP — Landsat Engine (Python FastAPI, porta 8093).
 */

import type { SpectralIndex, TemporalScene, Wgs84Bbox } from "./temporal-types";

export type LandsatEngineScene = {
  id: string;
  collection: string;
  provider: string;
  satellite: string;
  date: string;
  cloud_cover_pct?: number | null;
  stac_item_url: string;
  visual_mode: "natural" | "grayscale";
};

export type LandsatDownloadResult = {
  ok: boolean;
  scene_id: string;
  date: string;
  satellite: string;
  preview_url: string;
  geotiff_path?: string;
  bounds: Wgs84Bbox;
  spectral_mode: string;
};

const DEFAULT_ENGINE_URL =
  process.env.LANDSAT_ENGINE_URL ??
  process.env.NEXT_PUBLIC_LANDSAT_ENGINE_URL ??
  "http://127.0.0.1:8093";

export function landsatEngineUrl(): string {
  return DEFAULT_ENGINE_URL.replace(/\/+$/, "");
}

export function isLandsatEngineConfigured(): boolean {
  return Boolean(
    process.env.LANDSAT_ENGINE_URL?.trim() ||
      process.env.NEXT_PUBLIC_LANDSAT_ENGINE_URL?.trim() ||
      process.env.NODE_ENV === "development",
  );
}

export async function searchLandsatEngineCatalog(params: {
  bbox: Wgs84Bbox;
  dateFrom: string;
  dateTo: string;
  maxCloudPct?: number;
  limit?: number;
}): Promise<{
  scenes: LandsatEngineScene[];
  sources: string[];
  warnings: string[];
}> {
  const res = await fetch(`${landsatEngineUrl()}/api/v1/landsat/catalog/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bbox: params.bbox,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      max_cloud_pct: params.maxCloudPct ?? 40,
      limit: params.limit ?? 80,
      satellites: ["landsat", "sentinel2"],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Landsat engine ${res.status}`);
  }
  const json = (await res.json()) as {
    scenes: LandsatEngineScene[];
    sources: string[];
    warnings: string[];
  };
  return json;
}

export function engineSceneToTemporal(s: LandsatEngineScene, bbox: Wgs84Bbox): TemporalScene {
  return {
    id: `engine-${s.id}`,
    provider: s.provider === "sentinel2" ? "sentinel2" : "landsat",
    satellite: s.satellite,
    date: s.date,
    cloudCoverPct: s.cloud_cover_pct ?? undefined,
    bounds: bbox,
    stacItemUrl: s.stac_item_url,
    visualMode: s.visual_mode,
    demo: false,
  };
}

export async function downloadLandsatEngineScene(params: {
  bbox: Wgs84Bbox;
  date: string;
  sceneId?: string;
  stacItemUrl?: string;
  spectralMode?: SpectralIndex;
}): Promise<LandsatDownloadResult> {
  const res = await fetch(`${landsatEngineUrl()}/api/v1/landsat/imagery/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bbox: params.bbox,
      date: params.date,
      scene_id: params.sceneId,
      stac_item_url: params.stacItemUrl,
      spectral_mode:
        params.spectralMode === "grayscale" ||
        params.spectralMode === "false_color" ||
        params.spectralMode === "ndvi"
          ? params.spectralMode
          : "rgb",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Download Landsat ${res.status}`);
  }
  return (await res.json()) as LandsatDownloadResult;
}

/** URL de preview via proxy Next.js (browser). */
export function proxyPreviewUrl(
  sceneKey: string,
  spectralMode: SpectralIndex = "rgb",
): string {
  return `/api/geo/temporal/landsat/preview/${encodeURIComponent(sceneKey)}?spectral_mode=${spectralMode}`;
}

export const GARUVA_EXAMPLE_BBOX: Wgs84Bbox = {
  west: -48.72,
  south: -26.32,
  east: -48.58,
  north: -26.22,
};

export const GARUVA_DATE_FROM = "1972-07-23";
export const GARUVA_DATE_TO = "2026-12-31";

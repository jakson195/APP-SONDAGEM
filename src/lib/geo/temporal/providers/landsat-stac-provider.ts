import type { TemporalScene, Wgs84Bbox } from "../temporal-types";
import { landsatMissionForDate } from "../temporal-date-range";
import {
  ESRI_WORLD_IMAGERY,
  stacTitilerPhotoTileUrl,
  visualModeForDate,
  type StacVisualMode,
} from "../stac-visual";

const EARTH_SEARCH = "https://earth-search.aws.element84.com/v1/search";

type StacFeature = {
  id: string;
  properties?: {
    datetime?: string;
    "eo:cloud_cover"?: number;
    platform?: string;
  };
  links?: { rel: string; href: string }[];
  bbox?: number[];
};

type StacSearchResponse = {
  features?: StacFeature[];
};

function itemSelfHref(feature: StacFeature): string | undefined {
  return feature.links?.find((l) => l.rel === "self")?.href;
}

function bboxFromStac(feature: StacFeature, fallback: Wgs84Bbox): Wgs84Bbox {
  const b = feature.bbox;
  if (!b || b.length < 4) return fallback;
  return {
    west: b[0]!,
    south: b[1]!,
    east: b[2]!,
    north: b[3]!,
  };
}

function featureToScene(
  feature: StacFeature,
  fallbackBbox: Wgs84Bbox,
): TemporalScene | null {
  const self = itemSelfHref(feature);
  if (!self) return null;
  const date = feature.properties?.datetime?.slice(0, 10);
  if (!date) return null;
  const cloud = feature.properties?.["eo:cloud_cover"];
  const platform = feature.properties?.platform ?? landsatMissionForDate(date);
  const visualMode = visualModeForDate(date);
  return {
    id: `landsat-stac-${feature.id}`,
    provider: "landsat",
    satellite: platform,
    date,
    cloudCoverPct: typeof cloud === "number" ? cloud : undefined,
    bounds: bboxFromStac(feature, fallbackBbox),
    tileUrl: stacTitilerPhotoTileUrl(self, date, visualMode),
    stacItemUrl: self,
    visualMode,
    demo: false,
  };
}

/** Uma cena por ano (menor cobertura de nuvens). */
function sampleOnePerYear(features: StacFeature[]): StacFeature[] {
  const byYear = new Map<number, StacFeature>();
  for (const f of features) {
    const date = f.properties?.datetime?.slice(0, 10);
    if (!date) continue;
    const year = Number(date.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const cloud = f.properties?.["eo:cloud_cover"] ?? 100;
    const prev = byYear.get(year);
    if (!prev) {
      byYear.set(year, f);
      continue;
    }
    const prevCloud = prev.properties?.["eo:cloud_cover"] ?? 100;
    if (cloud < prevCloud) byYear.set(year, f);
  }
  return [...byYear.values()].sort((a, b) =>
    (a.properties?.datetime ?? "").localeCompare(b.properties?.datetime ?? ""),
  );
}

function closestToDate(features: StacFeature[], targetDate: string): StacFeature | null {
  if (features.length === 0) return null;
  const target = new Date(`${targetDate.slice(0, 10)}T12:00:00Z`).getTime();
  let best = features[0]!;
  let bestDelta = Infinity;
  for (const f of features) {
    const d = f.properties?.datetime?.slice(0, 10);
    if (!d) continue;
    const delta = Math.abs(
      new Date(`${d}T12:00:00Z`).getTime() - target,
    );
    if (delta < bestDelta) {
      bestDelta = delta;
      best = f;
    }
  }
  return best;
}

async function stacSearch(body: Record<string, unknown>): Promise<StacFeature[]> {
  const res = await fetch(EARTH_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Earth Search STAC ${res.status}`);
  const data = (await res.json()) as StacSearchResponse;
  return data.features ?? [];
}

export async function searchLandsatStac(params: {
  bbox: Wgs84Bbox;
  dateFrom: string;
  dateTo: string;
  maxCloudPct?: number;
  limit?: number;
}): Promise<TemporalScene[]> {
  const maxCloud = params.maxCloudPct ?? 40;
  const features = await stacSearch({
    collections: ["landsat-c2-l2"],
    bbox: [params.bbox.west, params.bbox.south, params.bbox.east, params.bbox.north],
    datetime: `${params.dateFrom}T00:00:00Z/${params.dateTo}T23:59:59Z`,
    limit: Math.min(params.limit ?? 120, 250),
    sort: [{ field: "datetime", direction: "asc" as const }],
    query: { "eo:cloud_cover": { lt: maxCloud } },
  });

  const scenes: TemporalScene[] = [];
  for (const feature of sampleOnePerYear(features)) {
    const scene = featureToScene(feature, params.bbox);
    if (scene) scenes.push(scene);
  }
  return scenes;
}

/** Resolve cena Landsat mais próxima de uma data (visual timelapse). */
export async function fetchLandsatSceneForDate(params: {
  bbox: Wgs84Bbox;
  date: string;
  maxCloudPct?: number;
  visualMode?: StacVisualMode;
}): Promise<TemporalScene | null> {
  const target = params.date.slice(0, 10);
  const start = new Date(`${target}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 90);
  const end = new Date(`${target}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 90);

  const features = await stacSearch({
    collections: ["landsat-c2-l2"],
    bbox: [params.bbox.west, params.bbox.south, params.bbox.east, params.bbox.north],
    datetime: `${start.toISOString()}/${end.toISOString()}`,
    limit: 20,
    query: { "eo:cloud_cover": { lt: params.maxCloudPct ?? 55 } },
  });

  const pick = closestToDate(features, target);
  if (!pick) return null;
  const scene = featureToScene(pick, params.bbox);
  if (!scene) return null;

  if (params.visualMode && scene.stacItemUrl) {
    scene.tileUrl = stacTitilerPhotoTileUrl(
      scene.stacItemUrl,
      scene.date,
      params.visualMode,
    );
    scene.visualMode = params.visualMode;
  }
  return scene;
}

export { stacTitilerPhotoTileUrl as stacTitilerTileUrl };

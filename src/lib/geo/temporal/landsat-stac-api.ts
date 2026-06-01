import type { SpectralIndex, Wgs84Bbox } from "./temporal-types";

export type StacScene = {
  id: string;
  collection: string;
  provider: string;
  satellite: string;
  date: string;
  cloud_cover_pct?: number | null;
  stac_item_url: string;
  visual_mode: "natural" | "grayscale";
};

export type StacSearchResult = {
  ok: boolean;
  scenes: StacScene[];
  sources?: string[];
  warnings?: string[];
  error?: string;
};

export type StacDownloadResult = {
  ok: boolean;
  scene_id: string;
  date: string;
  satellite: string;
  previewProxyUrl: string;
  bounds: Wgs84Bbox;
  spectral_mode: string;
  error?: string;
};

/** Bbox mínimo a partir de polígono GeoJSON desenhado no Mapbox. */
export function bboxFromGeoJson(
  feature: GeoJSON.Feature | undefined,
): Wgs84Bbox | null {
  if (!feature?.geometry) return null;
  const rings: number[][][] = [];
  const g = feature.geometry;
  if (g.type === "Polygon") rings.push(g.coordinates[0] ?? []);
  else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates) rings.push(poly[0] ?? []);
  } else return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const coord of ring) {
      const lng = coord[0]!;
      const lat = coord[1]!;
      west = Math.min(west, lng);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      north = Math.max(north, lat);
    }
  }
  if (!Number.isFinite(west)) return null;
  return { west, south, east, north };
}

export async function searchLandsatByYear(
  bbox: Wgs84Bbox,
  year: number,
  maxCloudPct = 45,
): Promise<StacSearchResult> {
  const res = await fetch("/api/geo/temporal/landsat/search-year", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bbox, year, maxCloudPct }),
  });
  return (await res.json()) as StacSearchResult;
}

export async function downloadLandsatScene(params: {
  bbox: Wgs84Bbox;
  date: string;
  sceneId: string;
  stacItemUrl: string;
  spectralMode: SpectralIndex;
}): Promise<StacDownloadResult> {
  const res = await fetch("/api/geo/temporal/landsat/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bbox: params.bbox,
      date: params.date,
      sceneId: params.sceneId,
      stacItemUrl: params.stacItemUrl,
      spectralMode: params.spectralMode,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  return (await res.json()) as StacDownloadResult;
}

export function imageCoordsFromBbox(
  bbox: Wgs84Bbox,
): [[number, number], [number, number], [number, number], [number, number]] {
  const { west, south, east, north } = bbox;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

export const GARUVA_BBOX: Wgs84Bbox = {
  west: -48.72,
  south: -26.32,
  east: -48.58,
  north: -26.22,
};

export const LANDSAT_YEAR_MIN = 1972;
export const LANDSAT_YEAR_MAX = new Date().getFullYear();

export type DemDownloadResult = {
  ok: boolean;
  error?: string;
};

/** Baixa GeoTIFF DEM via motor Python + OpenTopography. */
export async function downloadDemOpenTopography(
  bbox: Wgs84Bbox,
  demType = "COP30",
): Promise<DemDownloadResult> {
  try {
    const res = await fetch("/api/geodata/opentopography/dem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...bbox, demType }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dem-${demType.toLowerCase()}-${bbox.west.toFixed(2)}_${bbox.south.toFixed(2)}.tif`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao baixar DEM",
    };
  }
}

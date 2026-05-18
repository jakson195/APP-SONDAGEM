import { resolveGeoApiBase } from "./geo-base";
import { apiUrl } from "@/lib/api-url";

export interface InsarJobCreate {
  name: string;
  date_from: string;
  date_to: string;
  reference_date?: string;
  orbit_direction?: "ASC" | "DESC";
  aoi_geojson?: GeoJSON.Polygon;
  run_immediately?: boolean;
}

export interface InsarJob {
  id: string;
  project_id: string;
  name: string;
  status: string;
  date_from: string;
  date_to: string;
  scene_count: number;
  properties: Record<string, unknown>;
}

export interface InsarRaster {
  id: string;
  raster_kind: string;
  epoch_date?: string | null;
  download_url: string;
  preview_url?: string | null;
  metadata_url: string;
  min_value?: number | null;
  max_value?: number | null;
  units: string;
}

function geoInsarUrl(projectId: string, suffix: string): string {
  const base = resolveGeoApiBase();
  const pid = encodeURIComponent(projectId);
  return `${base}/v1/projects/${pid}/insar${suffix}`;
}

export async function createInsarJob(
  projectId: string,
  body: InsarJobCreate,
): Promise<InsarJob> {
  const res = await fetch(geoInsarUrl(projectId, "/jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<InsarJob>;
}

export interface InsarRasterDetail extends InsarRaster {
  footprint?: GeoJSON.Polygon | null;
  crs_epsg?: number;
  nodata_value?: number | null;
}

export async function listInsarRasters(
  projectId: string,
  jobId?: string,
  kind?: "displacement" | "velocity" | "coherence",
): Promise<{ items: InsarRaster[] }> {
  const params = new URLSearchParams();
  if (jobId) params.set("job_id", jobId);
  if (kind) params.set("kind", kind);
  const qs = params.toString();
  const res = await fetch(
    geoInsarUrl(projectId, `/rasters${qs ? `?${qs}` : ""}`),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ items: InsarRaster[] }>;
}

export async function fetchInsarRasterDetail(
  projectId: string,
  rasterId: string,
): Promise<InsarRasterDetail> {
  const res = await fetch(
    geoInsarUrl(projectId, `/rasters/${encodeURIComponent(rasterId)}`),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<InsarRasterDetail>;
}

export async function retryInsarJob(
  projectId: string,
  jobId: string,
): Promise<{ ok: boolean; jobId: string }> {
  const res = await fetch(
    apiUrl(
      `/api/geo/v1/projects/${encodeURIComponent(projectId)}/insar/jobs/${encodeURIComponent(jobId)}/run`,
    ),
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; jobId: string }>;
}

export function insarGeotiffUrl(projectId: string, rasterId: string): string {
  const path = geoInsarUrl(
    projectId,
    `/rasters/${encodeURIComponent(rasterId)}/download`,
  );
  return apiUrl(path);
}

export type InsarPipelineStageLog = {
  step: string;
  at: string;
  ok: boolean;
  detail?: string;
};

export type InsarJobPollResponse = {
  id?: string;
  status: string;
  properties?: {
    stages?: InsarPipelineStageLog[];
    message?: string;
  };
  stages?: InsarPipelineStageLog[];
  error_message?: string | null;
};

export async function fetchInsarJobStatus(
  projectId: string,
  jobId: string,
): Promise<InsarJobPollResponse> {
  const res = await fetch(
    geoInsarUrl(projectId, `/jobs/${encodeURIComponent(jobId)}`),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<InsarJobPollResponse>;
}

export type InsarPreflightResponse = {
  obraId: number;
  obraNome: string;
  period: { date_from: string; date_to: string; orbit: string };
  aoi: { obra_geojson_aoi: boolean; obra_coordinates: boolean };
  catalog: {
    total_entries: number;
    ready_slc_local: number;
    pair_ready: boolean;
  };
  copernicus: {
    credentialsConfigured: boolean;
    usernameHint: string | null;
    tokenOk: boolean;
    expiresInSec?: number;
    tokenError?: string;
  };
  processing: {
    snap_configured: boolean;
    synthetic_fallback_enabled: boolean;
  };
  cesium: { note: string };
};

export async function fetchInsarPreflight(
  projectId: string,
  params: { date_from: string; date_to: string; orbit?: string },
): Promise<InsarPreflightResponse> {
  const q = new URLSearchParams({
    date_from: params.date_from,
    date_to: params.date_to,
  });
  if (params.orbit) q.set("orbit", params.orbit);
  const res = await fetch(
    geoInsarUrl(projectId, `/preflight?${q.toString()}`),
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<InsarPreflightResponse>;
}

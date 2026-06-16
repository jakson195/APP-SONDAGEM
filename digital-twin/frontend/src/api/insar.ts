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

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export async function createInsarJob(
  projectId: string,
  body: InsarJobCreate,
): Promise<InsarJob> {
  const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/insar/jobs`, {
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
    `${API_BASE}/api/v1/projects/${projectId}/insar/rasters${qs ? `?${qs}` : ""}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ items: InsarRaster[] }>;
}

export async function fetchInsarRasterDetail(
  projectId: string,
  rasterId: string,
): Promise<InsarRasterDetail> {
  const res = await fetch(
    `${API_BASE}/api/v1/projects/${projectId}/insar/rasters/${rasterId}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<InsarRasterDetail>;
}

export function insarGeotiffUrl(projectId: string, rasterId: string): string {
  return `${API_BASE}/api/v1/projects/${projectId}/insar/rasters/${rasterId}/download`;
}

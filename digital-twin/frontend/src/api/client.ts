import type {
  DeformationResponse,
  ProjectSummary,
  TimelineResponse,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function fetchProjects(): Promise<{ items: ProjectSummary[] }> {
  return getJson("/api/v1/projects");
}

export function fetchTimeline(projectId: string): Promise<TimelineResponse> {
  return getJson(`/api/v1/projects/${projectId}/timeline`);
}

export function fetchDeformations(
  projectId: string,
  params?: { epoch_from?: string; epoch_to?: string; limit?: number },
): Promise<DeformationResponse> {
  const q = new URLSearchParams();
  if (params?.epoch_from) q.set("epoch_from", params.epoch_from);
  if (params?.epoch_to) q.set("epoch_to", params.epoch_to);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return getJson(
    `/api/v1/projects/${projectId}/deformations${qs ? `?${qs}` : ""}`,
  );
}

export function deformationsToGeoJSON(
  items: DeformationResponse["items"],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((p) => ({
      type: "Feature",
      geometry: p.geometry,
      properties: {
        id: p.id,
        epoch_date: p.epoch_date,
        displacement_mm: p.displacement_mm,
        velocity_mm_yr: p.velocity_mm_yr,
        coherence: p.coherence,
      },
    })),
  };
}

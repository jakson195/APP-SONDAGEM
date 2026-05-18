import { resolveGeoApiBase } from "./geo-base";

export type PredictionStatus = "pending" | "running" | "completed" | "failed";

export interface PredictionRun {
  id: string;
  project_id: string;
  status: PredictionStatus;
  horizon_days: number;
  model_version: string;
  summary: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PredictionPoint {
  id: string;
  insar_displacement_id: string | null;
  geometry: GeoJSON.Geometry;
  forecast_displacement_mm: number;
  rupture_risk: number;
  failure_probability: number;
  confidence: number;
  properties: Record<string, unknown>;
}

export interface PredictionDetail extends PredictionRun {
  points: PredictionPoint[];
  probability_map: GeoJSON.FeatureCollection | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = resolveGeoApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function pid(projectId: string): string {
  return encodeURIComponent(projectId);
}

export function runPrediction(
  projectId: string,
  horizonDays = 30,
): Promise<PredictionRun> {
  return api(`/v1/projects/${pid(projectId)}/predictions/run`, {
    method: "POST",
    body: JSON.stringify({ horizon_days: horizonDays }),
  });
}

export function fetchLatestPrediction(projectId: string): Promise<PredictionDetail> {
  return api(`/v1/projects/${pid(projectId)}/predictions/runs/latest`);
}

export function fetchPredictionRuns(
  projectId: string,
): Promise<{ items: PredictionRun[]; total: number }> {
  return api(`/v1/projects/${pid(projectId)}/predictions/runs`);
}

export function fetchProbabilityMap(
  projectId: string,
  runId: string,
): Promise<GeoJSON.FeatureCollection> {
  return api(
    `/v1/projects/${pid(projectId)}/predictions/runs/${encodeURIComponent(runId)}/probability-map`,
  );
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  boundary?: GeoJSON.Geometry | null;
  center?: GeoJSON.Geometry | null;
}

export interface TimelineEpoch {
  epoch_date: string;
  displacement_count: number;
  mean_displacement_mm?: number | null;
  insar_scenes: number;
  open_alerts: number;
}

export interface TimelineResponse {
  project_id: string;
  epochs: TimelineEpoch[];
  insar_acquisitions: Array<{
    id: string;
    acquisition_date: string;
    footprint?: GeoJSON.Geometry | null;
  }>;
}

export interface DisplacementPoint {
  id: string;
  epoch_date: string;
  displacement_mm: number;
  geometry: GeoJSON.Point;
  velocity_mm_yr?: number | null;
  coherence?: number | null;
}

export interface DeformationResponse {
  project_id: string;
  items: DisplacementPoint[];
}

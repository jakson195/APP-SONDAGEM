import type { FeatureCollection, LineString, Point, Polygon } from "geojson";

export type RiskLevel = "baixo" | "medio" | "alto";

export type SurveyRecord = {
  id: string;
  project_id: string;
  label: string;
  kind: "ortho" | "dsm";
  captured_at: string;
  path: string;
  file_name: string;
};

export type ChangePointProperties = {
  intensity: number;
  risk: RiskLevel;
  risk_score?: number;
  tipo?: string;
  flow_mag_px?: number;
  dsm_delta_m?: number | null;
  area_px?: number;
};

export type ChangePointsGeoJSON = FeatureCollection<Point, ChangePointProperties>;
export type VectorsGeoJSON = FeatureCollection<LineString>;
export type SegmentationGeoJSON = FeatureCollection<Polygon>;

export type AnalysisResult = {
  job_id: string;
  ok: boolean;
  bounds: [number, number, number, number];
  point_count: number;
  vector_count: number;
  polygon_count?: number;
  risk_summary: Record<RiskLevel, number>;
  overall_risk: RiskLevel;
  overall_score: number;
  change_area_pct: number;
  max_displacement_px: number;
  segmentation_method?: string;
  heatmap_url: string;
  points_geojson: ChangePointsGeoJSON;
  vectors_geojson?: VectorsGeoJSON;
  segmentation_geojson?: SegmentationGeoJSON;
  outputs?: Record<string, string>;
};

export type TemporalDashboardPoint = {
  date: string;
  label: string;
  risk_score: number;
  risk_level: RiskLevel;
  change_area_pct: number;
};

import type { FeatureCollection, Point } from "geojson";

export type ChangePointProperties = {
  intensity: number;
  risk: string;
  area_px?: number;
};

export type ChangePointsGeoJSON = FeatureCollection<Point, ChangePointProperties>;

export type CompareMeta = {
  bounds: [number, number, number, number];
  pointCount: number;
  threshold: number;
};

export type UploadSlot = "T0" | "T1";

export type OrthoPreview = {
  slot: UploadSlot;
  fileName: string;
  previewUrl: string;
  bounds: [number, number, number, number];
};

export type CompareResult = {
  ok: boolean;
  bounds: [number, number, number, number];
  pointCount: number;
  heatmapUrl: string;
  pointsGeoJson: ChangePointsGeoJSON;
  diffUrl?: string;
};

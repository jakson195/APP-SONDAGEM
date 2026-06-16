export type LayerKind = "geojson" | "3dtiles" | "raster" | "insar";

export interface TemporalRange {
  epochFrom?: string;
  epochTo?: string;
}

export interface LayerRecord {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  opacity: number;
  temporal?: TemporalRange;
  /** URL remota ou identificador Ion */
  source?: string;
}

export interface AddGeoJsonOptions {
  name: string;
  data: string | GeoJSON.GeoJSON;
  temporal?: TemporalRange;
  flyTo?: boolean;
}

export interface Add3DTilesOptions {
  name: string;
  url: string;
  ionAssetId?: number;
  temporal?: TemporalRange;
  flyTo?: boolean;
  /** Estilo otimizado para nuvem de pontos (3D Tiles pnts) */
  pointCloud?: boolean;
  pointSize?: number;
}

export interface AddRasterOptions {
  name: string;
  /** Template XYZ, WMS base URL ou imagem única */
  mode: "xyz" | "wms" | "single";
  url: string;
  layers?: string;
  rectangle?: [number, number, number, number];
  temporal?: TemporalRange;
  opacity?: number;
}

export interface AddInsarGeotiffOptions {
  name: string;
  geotiffUrl: string;
  epochDate?: string | null;
  rasterKind?: "displacement" | "velocity" | "coherence";
  opacity?: number;
  thresholds?: { stableMaxMm: number; criticalMinMm: number };
  flyTo?: boolean;
}

export interface FlyToTarget {
  longitude: number;
  latitude: number;
  height?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  duration?: number;
}

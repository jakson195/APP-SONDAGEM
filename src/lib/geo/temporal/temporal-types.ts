/** Módulo de imagens históricas — tipos partilhados. */

export type TemporalProvider =
  | "gee"
  | "sentinel_hub"
  | "inpe"
  | "landsat"
  | "sentinel2"
  | "cbers"
  | "srtm";

export type SpectralIndex =
  | "rgb"
  | "grayscale"
  | "false_color"
  | "ndvi"
  | "ndwi"
  | "iron_oxide"
  | "clay_alteration";

export type TemporalViewMode =
  | "single"
  | "split"
  | "animation"
  | "heatmap"
  | "voxel3d";

export type TemporalCompareMode = "none" | "side_by_side" | "swipe" | "diff";

export type TemporalAiTarget =
  | "geological_alteration"
  | "paleochannels"
  | "mineralization"
  | "slope_movement"
  | "vegetation_change"
  | "erosion_expansion";

export type Wgs84Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type TemporalScene = {
  id: string;
  provider: TemporalProvider;
  satellite: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  cloudCoverPct?: number;
  bounds: Wgs84Bbox;
  tileUrl?: string;
  wmsUrl?: string;
  wmsLayers?: string;
  thumbnailUrl?: string;
  bands?: string[];
  /** URL STAC (Earth Search) para cenas Landsat/Sentinel reais. */
  stacItemUrl?: string;
  /** natural = cor Google Earth; grayscale = P&B histórico. */
  visualMode?: "natural" | "grayscale";
  demo?: boolean;
};

export type TemporalCatalogRequest = {
  bbox: Wgs84Bbox;
  dateFrom: string;
  dateTo: string;
  providers?: TemporalProvider[];
  maxCloudPct?: number;
  limit?: number;
};

export type TemporalCatalogResponse = {
  scenes: TemporalScene[];
  providersUsed: TemporalProvider[];
  demoMode: boolean;
  warnings: string[];
};

export type TemporalTileRequest = {
  sceneId: string;
  index?: SpectralIndex;
  provider?: TemporalProvider;
};

export type TemporalChangePixel = {
  lat: number;
  lng: number;
  magnitude: number;
  /** 0–1 confiança */
  confidence: number;
};

export type TemporalChangeAnalysis = {
  dateA: string;
  dateB: string;
  index: SpectralIndex;
  changePct: number;
  meanDelta: number;
  hotspots: TemporalChangePixel[];
  heatmapGrid: {
    nx: number;
    ny: number;
    values: number[];
    bounds: Wgs84Bbox;
  };
};

export type TemporalAiDetection = {
  target: TemporalAiTarget;
  label: string;
  confidence: number;
  areaHa: number;
  bounds: Wgs84Bbox;
  summary: string;
};

export type TemporalAiResult = {
  detections: TemporalAiDetection[];
  summary: string;
  method: "tensorflow" | "spectral_rules" | "hybrid";
};

export const TEMPORAL_PROVIDER_LABELS: Record<TemporalProvider, string> = {
  gee: "Google Earth Engine",
  sentinel_hub: "Sentinel Hub",
  inpe: "INPE",
  landsat: "Landsat (USGS)",
  sentinel2: "Sentinel-2 (Copernicus)",
  cbers: "CBERS (INPE)",
  srtm: "SRTM / DEM",
};

export const SPECTRAL_INDEX_LABELS: Record<SpectralIndex, string> = {
  rgb: "RGB natural — estilo Google Earth",
  grayscale: "Pancromático / P&B (forçar)",
  false_color: "Falso cor (NIR-R-G)",
  ndvi: "NDVI — vegetação",
  ndwi: "NDWI — água / umidade",
  iron_oxide: "Razão óxidos de ferro",
  clay_alteration: "Razão alteração argilosa",
};

export const TEMPORAL_AI_TARGET_LABELS: Record<TemporalAiTarget, string> = {
  geological_alteration: "Alteração geológica",
  paleochannels: "Paleocanais",
  mineralization: "Áreas mineralizadas",
  slope_movement: "Movimentação de talude",
  vegetation_change: "Alteração de vegetação",
  erosion_expansion: "Expansão de erosão",
};

export const DEFAULT_TEMPORAL_BBOX: Wgs84Bbox = {
  west: -51.985,
  south: -14.295,
  east: -51.865,
  north: -14.175,
};

export {
  TEMPORAL_HISTORY_YEARS,
  defaultTemporalDateFrom,
  defaultTemporalDateTo,
} from "./temporal-date-range";

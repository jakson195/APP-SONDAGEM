import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "../dipolo2d/types";
import type { TopographyPoint } from "../dipolo2d/topography-types";

/** Modo de coordenadas da secção. */
export type GeorefCoordMode = "wgs84" | "project";

/** Ponto 3D da secção.
 *  wgs84: x=latitude(°), y=longitude(°), z=cota(m)
 *  project: x=Easting(m), y=Northing(m), z=cota(m) relativo à origem do projeto
 */
export type SectionPoint3D = {
  x: number;
  y: number;
  z: number;
};

/** Geometria georreferenciada de uma linha ERT (A → B). */
export type SurveyLineGeometry = {
  coordMode: GeorefCoordMode;
  /** Ponto inicial A da secção. */
  start: SectionPoint3D;
  /** Ponto final B da secção. */
  end: SectionPoint3D;
  /** Origem do projeto (wgs84: x=lat, y=lng, z=cota) — usada em coordMode=project. */
  projectOrigin?: SectionPoint3D;
  /** Azimute em graus (sentido horário a partir do Norte). */
  azimuthDeg?: number;
  /** Espaçamento entre eletrodos (m). */
  spacingM?: number;
};

/** Uma linha geofísica com dados, inversão e posição no terreno. */
export type GeophysSurveyLine = {
  id: string;
  name: string;
  readings: Dipolo2DReading[];
  topography?: TopographyPoint[];
  geometry: SurveyLineGeometry;
  invertParams?: Dipolo2DInvertParams;
  invertResult?: Dipolo2DInvertResult;
};

/** Método de interpolação entre secções. */
export type VolumeInterpMethod = "idw" | "nearest" | "kriging" | "rbf";

/** Motor de interpolação: browser (TS) ou Python (FastAPI). */
export type VolumeEngine = "browser" | "python";

export type VolumeBuildParams = {
  /** Células em X (Este). */
  nx: number;
  /** Células em Y (Norte). */
  ny: number;
  /** Células em profundidade (Z positivo para baixo). */
  nz: number;
  interpMethod: VolumeInterpMethod;
  engine: VolumeEngine;
  /** Expoente IDW (2 = padrão). */
  idwPower: number;
  /** Distância máxima (m) para influência de uma linha no plano. */
  maxInfluenceM: number;
  /** Profundidade máxima (m). */
  zMaxM: number;
  /** Posicionar blocos abaixo do terreno (DEM / topografia das linhas). */
  followTerrain?: boolean;
  /** Parâmetro RBF (SciPy multiquadric); omitido = auto. */
  rbfEpsilon?: number | null;
  /** Variograma Kriging (GSTools). */
  krigingVariogram?: "spherical" | "exponential" | "gaussian";
};

/** Controles de visualização 3D. */
export type VolumeViewControls = {
  depthM: number;
  verticalSliceAxis: "x" | "y";
  verticalSlicePos: number;
  showSections: boolean;
  showHorizontalSlice: boolean;
  showVerticalSlice: boolean;
  showIsosurface: boolean;
  showBlockModel: boolean;
  blockOpacity: number;
  blockDecimate: number;
  isoLogRho: number;
  sectionOpacity: number;
  sliceOpacity: number;
  isoOpacity: number;
  clipDepthM: number | null;
  clipEnabled: boolean;
};

/** Grade voxel 3D de log₁₀(ρ) row-major: idx = i + j*nx + k*nx*ny. */
export type ResistivityVolume3D = {
  logRho: Float32Array;
  nx: number;
  ny: number;
  nz: number;
  /** Origem em metros locais (centro da área). */
  originM: { x: number; y: number };
  /** Tamanho de célula (m). */
  cellSizeM: { x: number; y: number; z: number };
  /** Limites em metros locais. */
  boundsM: { minX: number; maxX: number; minY: number; maxY: number; maxZ: number };
  /** Centro geográfico (referência lat/lng). */
  anchorLat: number;
  anchorLng: number;
  /** Linhas usadas na construção. */
  lineIds: string[];
  /** Cota superficial (m ASL) por coluna planimétrica: idx = i + j*nx. */
  surfaceM?: Float32Array;
  /** Referência de cota para coordenada Y na cena (m ASL). */
  surfaceRefM?: number;
  /** Volume construído com terreno (DEM). */
  followTerrain?: boolean;
};

export type MultiLineSurvey = {
  id: string;
  name: string;
  lines: GeophysSurveyLine[];
  volume?: ResistivityVolume3D;
  volumeParams?: VolumeBuildParams;
};

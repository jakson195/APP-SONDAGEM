import type { CamadaEstratigrafica } from "@/components/perfil-estratigrafico";
import type { ResistivityNormProfile } from "./resistivity-norms-br";
import type { ResistivityRefRow } from "./resistivity-reference-table-br";

/** Material regional com faixa típica de resistividade (Ω·m). */
export type GeologicMaterialRho = {
  id: string;
  nome: string;
  cor: string;
  rhoMinOhmM: number;
  rhoMaxOhmM: number;
  /** Prior regional 0–1 (quanto é esperado na área). */
  prior: number;
};

/** Unidade do mapa geológico (CPRM, Macrostrat, etc.). */
export type GeologicMapUnit = {
  name: string;
  sigla?: string;
  lithology?: string;
  age?: string;
  description?: string;
  source: "cprm" | "geosgb" | "macrostrat";
  layerName?: string;
};

/** Contexto geológico regional (mapas + regras + IA). */
export type RegionalGeologyProfile = {
  regionName: string;
  province: string;
  summary: string;
  formations: string[];
  materials: GeologicMaterialRho[];
  /** Unidades litostratigráficas no ponto (CPRM / Macrostrat). */
  mapUnits: GeologicMapUnit[];
  /** Serviços consultados. */
  dataSources: string[];
  source: "rules" | "cprm" | "geosgb" | "macrostrat" | "ai" | "hybrid";
  anchorLat?: number;
  anchorLng?: number;
  /** Faixas normativas de ρ (BR + ajuste regional / IA). */
  resistivityNorm?: ResistivityNormProfile;
};

export function regionalMatchesLocation(
  reg: RegionalGeologyProfile,
  lat: number,
  lng: number,
  epsDeg = 0.02,
): boolean {
  if (reg.anchorLat == null || reg.anchorLng == null) return false;
  return (
    Math.abs(reg.anchorLat - lat) <= epsDeg &&
    Math.abs(reg.anchorLng - lng) <= epsDeg
  );
}

export type GeoSurveyLocation = {
  lat: number;
  lng: number;
  label?: string;
  /** Zoom ao ir para o ponto (ex.: busca por cidade). */
  zoom?: number;
  /** Alterado a cada busca para forçar o mapa a atualizar. */
  at?: number;
};

/** Perfil litológico numa coluna da malha (estação m). */
export type InterpretedColumn = {
  stationM: number;
  xIndex: number;
  layers: CamadaEstratigrafica[];
  /** Amostra por profundidade (diagnóstico). */
  samples: { zM: number; rhoOhmM: number; material: string; confidence: number }[];
};

export type GeologicLayerUnit = {
  id: number;
  label: string;
  material: string;
  cor: string;
  meanRhoOhmM: number;
  cellCount: number;
};

export type GeologicContactLine = {
  points: { xM: number; zM: number }[];
  layerAboveId: number;
  layerBelowId: number;
  layerAbove: string;
  layerBelow: string;
};

/** Resultado da interpretação geológica da secção 2D invertida. */
export type SectionGeologicInterpretation = {
  regional: RegionalGeologyProfile;
  columns: InterpretedColumn[];
  /** Coluna representativa (centro da linha). */
  representative: InterpretedColumn;
  /** Camadas detectadas no perfil de ρ (k-means no log ρ). */
  layerUnits: GeologicLayerUnit[];
  /** Linhas de contato entre camadas no perfil 2D. */
  contactLines: GeologicContactLine[];
  /** Escala log ρ usada na segmentação. */
  logRhoLo: number;
  logRhoHi: number;
  /** Malha plana nx×nz: -1 fora da máscara, senão id da camada. */
  layerGrid: number[];
  gridNx: number;
  gridNz: number;
  narrative: string;
  /** Notas de validação em campo (IA opcional). */
  fieldNotes?: string;
  /** Confiança da narrativa IA (quando aplicável). */
  aiConfidence?: "alta" | "media" | "baixa";
  /** Norma de classificação ρ aplicada na secção. */
  resistivityNorm: ResistivityNormProfile;
  /** Tabela utilizada para classificar a secção interpretativa. */
  classificationTable: ResistivityRefRow[];
  generatedAt: string;
};

/** Resumo de células enviado à API (opcional). */
export type InvertCellSummary = {
  rhoMinOhmM: number;
  rhoMaxOhmM: number;
  rhoMedianOhmM: number;
  depthMaxM: number;
  stationMinM: number;
  stationMaxM: number;
  sampleCount: number;
};

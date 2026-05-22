export type HidroChuEstacao = {
  nome: string;
  municipio: string;
  codigo: string;
  latitude: string;
  longitude: string;
  altitude: number;
  fonte: string;
  anoInicial: number;
  anoFinal: number;
};

export type HidroChuDuracaoInput = {
  duracaoDias: number;
  /** Série de máximas anuais (mm) — preferencial para K-S e ajuste. */
  valores?: number[];
  /** Estatísticas observadas (quando não há série bruta). */
  media?: number;
  desvio?: number;
  assimetria?: number;
  maior?: number;
  menor?: number;
};

export type GumbelChowFit = {
  alpha: number;
  beta: number;
  yn: number;
  sn: number;
  n: number;
  media: number;
  desvio: number;
  assimetria: number;
  maior: number;
  menor: number;
  ksDMax: number | null;
  ksDCritico: number;
  ksOk: boolean | null;
};

export type GumbelQuantileRow = {
  T: number;
  y: number;
  x: number;
  pLe: number;
  pGe: number;
};

export const PERIODOS_RETORNO = [2, 5, 10, 15, 20, 25, 50, 100] as const;

/** Estação importada (CSV ANA / catálogo). */
export type EstacaoImportada = HidroChuEstacao & {
  id: string;
  lat?: number;
  lng?: number;
  nDados?: number;
  falhas?: number;
  importadoEm?: string;
};

/** Registro diário de precipitação. */
export type RegistroDiario = {
  codigo: string;
  data: string;
  precipitacao: number;
};

export type HidroChuStoreMeta = {
  estacoesImportadas: number;
  seriesCodigos: string[];
  ultimaImportacao?: string;
};

export type HidroChuPersisted = {
  estacoes: EstacaoImportada[];
  series: Record<string, RegistroDiario[]>;
  meta: HidroChuStoreMeta;
  /** UI state legado */
  estacao?: HidroChuEstacao;
  serie1dia?: string;
  statsExtra?: string;
  mesContagens?: string;
};

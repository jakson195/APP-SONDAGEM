import type { HidroChuDuracaoInput, HidroChuEstacao } from "@/lib/hidrochu/types";

export type FonteHidrologica =
  | "ANA"
  | "INMET"
  | "CPRM"
  | "CEMADEN"
  | "DadosAbertos"
  | "Manual";

export type TipoEstacaoBr = "Pluviometrica" | "Fluviometrica" | "Mista";

export type EstacaoBrasil = {
  codigo: string;
  nome: string;
  uf: string;
  municipio: string;
  bacia?: string;
  tipo: TipoEstacaoBr;
  latitude: number;
  longitude: number;
  altitudeM?: number;
  fonte: FonteHidrologica;
  /** Código INMET (ex. A801) — importação automática BDMEP/API. */
  codigoInmet?: string;
  operadora?: string;
  areaDrenagemKm2?: number;
  periodoInicio?: string;
  periodoFim?: string;
};

export type RegistroDiarioBr = {
  codigo: string;
  data: string;
  precipitacaoMm: number;
  cotaM?: number;
  vazaoM3s?: number;
};

export type ContextoEnchenteInformado = {
  /** Nível percebido do solo (0–1). */
  saturacaoSolo?: number;
  /** Urbanização / impermeabilização (0–1). */
  impermeabilizacao?: number;
  /** Presença de barragens / contenção a montante. */
  contencaoMontante?: boolean;
  /** População em área de risco (hab.). */
  populacaoRisco?: number;
  /** Observações do técnico / comunidade. */
  observacoes?: string;
  /** Alertas oficiais já emitidos. */
  alertaOficial?: "nenhum" | "atenção" | "alerta" | "emergência";
};

export type PrevisaoEnchenteInput = {
  estacao: EstacaoBrasil;
  /** Série diária recente (precipitação mm). */
  serieDiaria: RegistroDiarioBr[];
  /** Máxima diária estimada para TR=10 (mm) — Gumbel/IDF. */
  p1diaTr10Mm?: number;
  /** Intensidade IDF TR=10, 1h (mm/h). */
  i1hTr10MmH?: number;
  contexto?: ContextoEnchenteInformado;
};

export type FatorRiscoEnchente = {
  id: string;
  label: string;
  peso: number;
  valor: number;
  contribuicao: number;
};

export type PrevisaoEnchenteResult = {
  score: number;
  nivel: "baixo" | "moderado" | "alto" | "critico";
  probabilidade24h: number;
  probabilidade72h: number;
  fatores: FatorRiscoEnchente[];
  recomendacoes: string[];
  modelo: string;
  geradoEm: string;
};

export type HidroBrPersisted = {
  estacoesFavoritas: string[];
  series: Record<string, RegistroDiarioBr[]>;
  ultimaImportacao?: string;
  estacaoAtiva?: EstacaoBrasil;
  serie1dia?: string;
  statsExtra?: string;
  contextoEnchente?: ContextoEnchenteInformado;
  fontePreferida?: FonteHidrologica;
  autoImportEnabled?: boolean;
};

export type { HidroChuDuracaoInput, HidroChuEstacao };

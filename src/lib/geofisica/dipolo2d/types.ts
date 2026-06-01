/** Leitura colinear dipolo-dipolo em perfil 2D (várias estações, mesmo `a` típico). */
export type Dipolo2DReading = {
  stationM: number;
  /** Factor de separação n (inteiro ≥ 1). */
  n: number;
  rhoApparentOhmM: number;
  /** Comprimento de dipolo a (m); pode ser global na UI. */
  aM: number;
  /** SP (mV) — opcional, para QC de campo. */
  spMv?: number | null;
  /** V (mV) — opcional. */
  vMv?: number | null;
  /** i (mA) — opcional. */
  iMa?: number | null;
  /** Índice da linha na planilha SOLODATA (se aplicável). */
  sourceRowIndex?: number;
  /** Ponto excluído da inversão (ruído). */
  excluded?: boolean;
};

/** Método de inversão 2D no modelo invertido (dipolo-dipolo). */
export type Dipolo2DInvertMethodId =
  | "least_squares"
  | "occam"
  | "gauss_newton"
  | "smoothness"
  | "robust_l1"
  | "hybrid";

export const DIPOLO2D_INVERT_METHODS: {
  id: Dipolo2DInvertMethodId;
  label: string;
  short: string;
}[] = [
  {
    id: "least_squares",
    label: "Mínimos quadrados (Least Squares)",
    short: "LS",
  },
  { id: "occam", label: "Occam", short: "Occam" },
  {
    id: "gauss_newton",
    label: "Gauss-Newton",
    short: "G-N",
  },
  {
    id: "smoothness",
    label: "Suavizada (Smoothness Constrained)",
    short: "Suave",
  },
  {
    id: "robust_l1",
    label: "Robusta (norma L1)",
    short: "L1",
  },
  {
    id: "hybrid",
    label: "Híbrida L2/L1",
    short: "Hybrid",
  },
];

export type Dipolo2DInvertParams = {
  /** Profundidade pseudo z ≈ factorDepth × n × a (m). */
  factorDepth: number;
  /** Largura horizontal da sensibilidade (m). */
  sigmaXM: number;
  /** Largura vertical da sensibilidade (m). */
  sigmaZM: number;
  /** Peso da regularização (Laplaciano discreto). */
  lambda: number;
  /** Limiar Huber em espaço log₁₀(ρ); residuals acima são down-weighted. */
  huberC: number;
  maxIter: number;
  /** Decaimento de λ por iteração (ex.: 0.9). */
  lambdaDecay: number;
  /** Valor mínimo de λ durante refinamento iterativo. */
  lambdaMin: number;
  /** Ganho mínimo relativo para continuar iterando. */
  minImprovement: number;
  /** Malha: número de colunas (x) e linhas (z, crescente com profundidade). */
  nx: number;
  nz: number;
  /**
   * Mistura L2/L1 nos resíduos do método «Híbrida».
   * 1 = L2 puro (Huber), 0 = L1 puro. Ignorado pelos outros métodos.
   */
  hybridAlpha: number;
};

export type Dipolo2DIterationRecord = {
  iter: number;
  rmsLog10: number;
  lambda: number;
  phi: number;
  roughnessL2: number;
  /** Ganho relativo da função objetivo vs iteração anterior. */
  relativeGain: number | null;
};

export type Dipolo2DInvertResult = {
  /** log₁₀(ρ) em malha row-major: índice i*nz+j, i=x, j=profundidade. */
  mLog10: Float64Array;
  xEdgesM: Float64Array;
  zEdgesM: Float64Array;
  /** log₁₀(ρa) observado e sintético por leitura (mesma ordem que entrada). */
  yObsLog10: Float64Array;
  ySynLog10: Float64Array;
  rmsLog10: number;
  roughnessL2: number;
  iterations: number;
  /** Histórico por iteração (RMS, λ, φ, rugosidade). */
  iterationHistory: Dipolo2DIterationRecord[];
  /** Dimensões da malha invertida. */
  nx: number;
  nz: number;
  methodId: Dipolo2DInvertMethodId;
  methodLabel: string;
};

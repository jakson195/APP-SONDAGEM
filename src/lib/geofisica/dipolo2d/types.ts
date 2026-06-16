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
  | "blocky_l1"
  | "hybrid";

export const DIPOLO2D_INVERT_METHODS: {
  id: Dipolo2DInvertMethodId;
  label: string;
  short: string;
}[] = [
  {
    id: "blocky_l1",
    label: "Blocky — contraste geológico (ResIPy R2)",
    short: "Blocky",
  },
  {
    id: "robust_l1",
    label: "Robusta L1 — dados (ResIPy R2)",
    short: "L1",
  },
  {
    id: "gauss_newton",
    label: "Gauss-Newton L2 (ResIPy R2)",
    short: "G-N",
  },
  {
    id: "smoothness",
    label: "Suavizada L2 (ResIPy R2)",
    short: "Suave",
  },
  {
    id: "least_squares",
    label: "Mínimos quadrados L2 (ResIPy R2)",
    short: "LS",
  },
  { id: "occam", label: "Occam (ResIPy R2)", short: "Occam" },
];

/** Métodos expostos na UI — apenas ResIPy (sem proxy gaussiano). */
export const RESIPY_INVERT_METHODS = DIPOLO2D_INVERT_METHODS.filter(
  (m) => m.id !== "least_squares",
);

export type Dipolo2DInvertParams = {
  /** Pseudoprofundidade / sensibilidade z ≈ factorDepth × n × a (ResIPy FMD ≈ 0,286). */
  factorDepth: number;
  /** Profundidade máxima do modelo RES2DINV: factor × n × a (tip. 1,0). */
  modelDepthFactor?: number;
  /** Extensão extra do modelo («model depth range» RES2DINV, tip. 1,05–1,30). */
  modelDepthRange?: number;
  /** @deprecated Proxy gaussiano removido — mantido só para compat. de presets. */
  sigmaXM: number;
  /** @deprecated Proxy gaussiano removido — mantido só para compat. de presets. */
  sigmaZM: number;
  /** Peso global da regularização (λ_reg, estilo RES2DINV ≈ 0,15). */
  lambda: number;
  /** Regularização anisotrópica horizontal D_x (≈ 0,1). */
  lambdaX: number;
  /** Regularização anisotrópica vertical D_z (≈ 0,4). */
  lambdaZ: number;
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
  /** Limites ρ modelo (Ω·m) — estilo ResIPy/RES2DINV. */
  rhoMinOhmM?: number;
  rhoMaxOhmM?: number;
  /** Malha ResIPy: trian | quad. */
  meshType?: "trian" | "quad";
  meshClFactor?: number;
  meshRefine?: number;
  meshFmdM?: number | null;
  tolerance?: number;
  aWgt?: number;
  bWgt?: number;
  filterReciprocal?: boolean;
  filterNegative?: boolean;
  filterDuplicates?: boolean;
  filterPctError?: number | null;
  contourSmoothPasses?: number;
  cropCorners?: boolean;
  sensitivityOverlay?: boolean;
  doiEstimate?: boolean;
};

export type Dipolo2DIterationRecord = {
  iter: number;
  rmsLog10: number;
  /** RMS relativo em % (motor físico). */
  rmsPercent?: number;
  lambda: number;
  phi: number;
  roughnessL2: number;
  /** Ganho relativo da função objetivo vs iteração anterior. */
  relativeGain: number | null;
  chi2Reduced?: number;
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
  /** RMS relativo médio em % (Ω·m). */
  rmsPercent?: number;
  roughnessL2: number;
  iterations: number;
  /** Histórico por iteração (RMS, λ, φ, rugosidade). */
  iterationHistory: Dipolo2DIterationRecord[];
  /** Dimensões da malha invertida. */
  nx: number;
  nz: number;
  methodId: Dipolo2DInvertMethodId;
  methodLabel: string;
  /** Motor: proxy gaussiano (browser) ou ResIPy R2 (physics). */
  engine?: "proxy" | "physics";
  physicsMessage?: string;
  /** Etapas do motor ResIPy (logs de progresso). */
  progressLog?: string[];
  excludedReadingIndices?: number[];
  forwardModel?: "fdm" | "fem";
  chi2Reduced?: number;
  chi2Target?: number;
  ndData?: number;
  /** Células activas (topo/malha), ordem i*nz+j. */
  activeCells?: boolean[];
  /** Profundidade com sensibilidade por coluna (m), do motor físico. */
  zCoverM?: number[];
};

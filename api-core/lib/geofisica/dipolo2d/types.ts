/** Leitura colinear dipolo-dipolo em perfil 2D (várias estações, mesmo `a` típico). */
export type Dipolo2DReading = {
  stationM: number;
  /** Factor de separação n (inteiro ≥ 1). */
  n: number;
  rhoApparentOhmM: number;
  /** Comprimento de dipolo a (m); pode ser global na UI. */
  aM: number;
};

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
  /** Malha: número de colunas (x) e linhas (z, crescente com profundidade). */
  nx: number;
  nz: number;
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
  /** Dimensões da malha invertida. */
  nx: number;
  nz: number;
};

/**
 * Parâmetros do workflow ResIPy / RES2DINV (pseudoseção → malha → inversão → visual).
 */

export type ResipyMeshType = "trian" | "quad";

export type ResipyWorkflowParams = {
  /** Limites do modelo invertido (Ω·m) — clamp pós-inversão. */
  rhoMinOhmM: number;
  rhoMaxOhmM: number;
  /** Malha ResIPy/R2. */
  meshType: ResipyMeshType;
  /** Characteristic length factor (refino junto aos eletrodos). */
  meshClFactor: number;
  /** Refinamentos extra da malha triangular. */
  meshRefine: number;
  /** Fine mesh depth (m); null = automático (factorDepth × n × a). */
  meshFmdM: number | null;
  /** Tolerância de convergência R2. */
  tolerance: number;
  /** Pesos do modelo de erro a_wgt / b_wgt (R2). */
  aWgt: number;
  bWgt: number;
  /** Filtros de dados (pré-inversão). */
  filterReciprocal: boolean;
  filterNegative: boolean;
  filterDuplicates: boolean;
  filterPctError: number | null;
  /** Pós-processamento visual. */
  contourSmoothPasses: number;
  cropCorners: boolean;
  sensitivityOverlay: boolean;
  doiEstimate: boolean;
};

export const DEFAULT_RESIPY_WORKFLOW: ResipyWorkflowParams = {
  rhoMinOhmM: 0.1,
  rhoMaxOhmM: 10_000,
  meshType: "trian",
  meshClFactor: 5,
  meshRefine: 0,
  meshFmdM: null,
  tolerance: 0.02,
  aWgt: 0.03,
  bWgt: 0,
  filterReciprocal: true,
  filterNegative: true,
  filterDuplicates: true,
  filterPctError: 15,
  contourSmoothPasses: 0,
  cropCorners: false,
  sensitivityOverlay: false,
  doiEstimate: false,
};

export const RESIPY_WORKFLOW_STEPS = [
  { id: "pseudo", label: "1. Pseudoseção", short: "Dados" },
  { id: "mesh", label: "2. Malha", short: "Malha" },
  { id: "invert", label: "3. Parâmetros", short: "Inversão" },
  { id: "display", label: "4. Visual", short: "Visual" },
] as const;

export type ResipyWorkflowStepId = (typeof RESIPY_WORKFLOW_STEPS)[number]["id"];

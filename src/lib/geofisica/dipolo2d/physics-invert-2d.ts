import type { TopographyPoint } from "./topography-types";
import type {
  Dipolo2DInvertMethodId,
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
  Dipolo2DReading,
} from "./types";

export type InvertEngineId = "proxy" | "physics";

type PhysicsResponse = {
  ok: boolean;
  error?: string;
  engine?: string;
  method?: Dipolo2DInvertMethodId;
  method_label?: string;
  nx?: number;
  nz?: number;
  x_edges_m?: number[];
  z_edges_m?: number[];
  m_log10?: number[];
  y_obs_log10?: number[];
  y_syn_log10?: number[];
  rms_log10?: number;
  rms_percent?: number;
  roughness_l2?: number;
  iterations?: number;
  iteration_history?: Dipolo2DInvertResult["iterationHistory"];
  excluded_indices?: number[];
  data_weights?: number[];
  message?: string;
};

function physicsMeshSize(p: Dipolo2DInvertParams): Pick<Dipolo2DInvertParams, "nx" | "nz"> {
  return {
    nx: Math.min(p.nx, 28),
    nz: Math.min(p.nz, 18),
  };
}

function toPhysicsPayload(
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
  method: Dipolo2DInvertMethodId,
  topography: TopographyPoint[] | undefined,
  qcByRow: Map<number, { qualityScore: number; isSpike: boolean }> | undefined,
) {
  const mesh = physicsMeshSize(params);
  return {
    readings: readings.map((r, i) => ({
      station_m: r.stationM,
      n: r.n,
      rho_ohm_m: r.rhoApparentOhmM,
      a_m: r.aM,
      excluded: r.excluded === true,
      sp_mv: r.spMv ?? null,
      v_mv: r.vMv ?? null,
      i_ma: r.iMa ?? null,
      qc_score:
        r.sourceRowIndex != null
          ? qcByRow?.get(r.sourceRowIndex)?.qualityScore ?? null
          : null,
      is_spike:
        r.sourceRowIndex != null
          ? qcByRow?.get(r.sourceRowIndex)?.isSpike ?? false
          : false,
    })),
    params: {
      nx: mesh.nx,
      nz: mesh.nz,
      factor_depth: params.factorDepth,
      lambda_reg: params.lambda,
      lambda_min: params.lambdaMin,
      lambda_decay: params.lambdaDecay,
      max_iter: Math.min(params.maxIter, 15),
      huber_c: params.huberC,
      min_improvement: params.minImprovement,
      target_rms_log10: 0.035,
      hybrid_alpha: params.hybridAlpha ?? 0.65,
      auto_exclude_outliers: true,
      outlier_score_threshold: 35,
      use_adaptive_mesh: true,
      jacobian_mode: "adjoint" as const,
    },
    method,
    topography: topography?.map((t) => ({
      station_m: t.stationM,
      elevation_m: t.elevationM,
    })),
  };
}

function mapPhysicsResponse(data: PhysicsResponse): Dipolo2DInvertResult | null {
  if (
    !data.ok ||
    !data.m_log10 ||
    !data.x_edges_m ||
    !data.z_edges_m ||
    !data.y_obs_log10 ||
    !data.y_syn_log10
  ) {
    return null;
  }
  return {
    mLog10: Float64Array.from(data.m_log10),
    xEdgesM: Float64Array.from(data.x_edges_m),
    zEdgesM: Float64Array.from(data.z_edges_m),
    yObsLog10: Float64Array.from(data.y_obs_log10),
    ySynLog10: Float64Array.from(data.y_syn_log10),
    rmsLog10: data.rms_log10 ?? 0,
    rmsPercent: data.rms_percent,
    roughnessL2: data.roughness_l2 ?? 0,
    iterations: data.iterations ?? 0,
    iterationHistory: data.iteration_history ?? [],
    nx: data.nx ?? 0,
    nz: data.nz ?? 0,
    methodId: data.method ?? "gauss_newton",
    methodLabel: data.method_label ?? "FDM físico",
    engine: "physics",
    physicsMessage: data.message,
    excludedReadingIndices: data.excluded_indices,
  };
}

export async function invertDipolo2DPhysics(
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
  method: Dipolo2DInvertMethodId,
  topography?: TopographyPoint[],
  qcByRow?: Map<number, { qualityScore: number; isSpike: boolean }>,
): Promise<Dipolo2DInvertResult | null> {
  const active = readings.filter((r) => !r.excluded && r.rhoApparentOhmM > 0);
  if (active.length < 4) return null;

  const res = await fetch("/api/geofisica/invert/2d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      toPhysicsPayload(readings, params, method, topography, qcByRow),
    ),
  });
  const data = (await res.json()) as PhysicsResponse & { error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Inversão física indisponível");
  }
  return mapPhysicsResponse(data);
}

export { physicsMeshSize };

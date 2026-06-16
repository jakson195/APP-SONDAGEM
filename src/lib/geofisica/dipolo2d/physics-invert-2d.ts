import type { TopographyPoint } from "./topography-types";
import { cloneFloat64Array, sanitizeModelLog10 } from "./model-visual-scale";
import {
  physicsIrlsInnerIterations,
  resolvePhysicsInvertMethod,
} from "./invert-method-resolve";
import { RES2DINV_INVERT_PARAMS } from "./res2dinv-preset";
import type {
  Dipolo2DInvertMethodId,
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
  Dipolo2DIterationRecord,
  Dipolo2DReading,
} from "./types";

/** @deprecated Proxy removido — apenas ResIPy R2. */
export type InvertEngineId = "physics";

export type PhysicsForwardModelId = "fdm" | "fem";

export type PhysicsInvertEngineId = "legacy" | "pygimli" | "simpeg" | "resipy";

export type Res2dinvPhysicsOptions = {
  /** Motor Python: apenas resipy (R2). */
  physicsBackend?: PhysicsInvertEngineId;
  /** @deprecated use physicsBackend === "legacy" */
  useLegacyEngine?: boolean;
  /** Jacobiana por diferenças finitas (só legacy). */
  jacobianFd?: boolean;
  /** λ adaptativo por χ²/RMS (só legacy). */
  adaptiveLambda?: boolean;
};

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
  progress_log?: string[];
  forward_model?: PhysicsForwardModelId;
  chi2_reduced?: number;
  chi2_target?: number;
  nd_data?: number;
  active_cells?: boolean[];
  z_cover_m?: number[];
};

function isFastResipyInvert(p: Dipolo2DInvertParams): boolean {
  return p.maxIter <= 6;
}

function physicsMeshSize(
  p: Dipolo2DInvertParams,
  forwardModel: PhysicsForwardModelId = "fdm",
  fast = true,
): Pick<Dipolo2DInvertParams, "nx" | "nz"> {
  if (forwardModel === "fem") {
    return {
      nx: Math.min(Math.max(p.nx, 16), 28),
      nz: Math.min(Math.max(p.nz, 10), 16),
    };
  }
  if (fast) {
    return {
      nx: Math.min(Math.max(p.nx, 12), 20),
      nz: Math.min(Math.max(p.nz, 6), 12),
    };
  }
  return {
    nx: Math.min(Math.max(p.nx, 14), 28),
    nz: Math.min(Math.max(p.nz, 8), 16),
  };
}

function normalizeIterationHistory(
  raw: Array<Record<string, unknown>> | undefined,
): Dipolo2DIterationRecord[] {
  if (!raw?.length) return [];
  return raw.map((row, i) => ({
    iter: Number(row.iter ?? i),
    rmsLog10: Number(row.rms_log10 ?? row.rmsLog10 ?? 0),
    rmsPercent:
      row.rms_percent != null
        ? Number(row.rms_percent)
        : row.rmsPercent != null
          ? Number(row.rmsPercent)
          : undefined,
    lambda: Number(row.lambda_reg ?? row.lambda ?? 0),
    phi: Number(row.phi ?? 0),
    roughnessL2: Number(row.roughness_l2 ?? row.roughnessL2 ?? 0),
    relativeGain:
      row.relative_gain != null
        ? Number(row.relative_gain)
        : row.relativeGain != null
          ? Number(row.relativeGain)
          : null,
    chi2Reduced:
      row.chi2_reduced != null
        ? Number(row.chi2_reduced)
        : row.chi2Reduced != null
          ? Number(row.chi2Reduced)
          : undefined,
  }));
}

function toPhysicsPayload(
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
  method: Dipolo2DInvertMethodId,
  topography: TopographyPoint[] | undefined,
  qcByRow: Map<number, { qualityScore: number; isSpike: boolean }> | undefined,
  forwardModel: PhysicsForwardModelId = "fdm",
  options?: Res2dinvPhysicsOptions,
) {
  const fastInvert = isFastResipyInvert(params);
  const mesh = physicsMeshSize(params, forwardModel, fastInvert);
  const maxIter =
    forwardModel === "fem"
      ? Math.min(Math.max(params.maxIter, 8), 24)
      : Math.max(3, Math.min(params.maxIter, fastInvert ? 8 : 28));
  const backend: PhysicsInvertEngineId = options?.physicsBackend ?? "resipy";
  const jacobianFd = options?.jacobianFd !== false;
  const adaptiveLambda = options?.adaptiveLambda !== false;
  const effectiveMethod = method;
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
      model_depth_factor: params.modelDepthFactor ?? 1.0,
      model_depth_range: params.modelDepthRange ?? 1.05,
      lambda_reg: params.lambda,
      lambda_x: params.lambdaX ?? RES2DINV_INVERT_PARAMS.lambdaX,
      lambda_z: params.lambdaZ ?? RES2DINV_INVERT_PARAMS.lambdaZ,
      lambda_min: params.lambdaMin,
      lambda_decay: params.lambdaDecay,
      max_iter: maxIter,
      huber_c: params.huberC,
      min_improvement: params.minImprovement,
      target_rms_log10: 0.05,
      target_rms_percent: 12,
      hybrid_alpha: params.hybridAlpha ?? 0.65,
      auto_exclude_outliers: false,
      outlier_score_threshold: 35,
      use_adaptive_mesh: forwardModel === "fem",
      use_line_search: true,
      trust_region_alpha: 0.35,
      geometric_z_layers: true,
      min_iter_before_stop: fastInvert ? 2 : 6,
      reg_normalize_mesh: false,
      irls_inner_iters: physicsIrlsInnerIterations(effectiveMethod),
      jacobian_mode:
        forwardModel === "fem" || jacobianFd ? ("fd" as const) : ("adjoint" as const),
      adaptive_lambda: adaptiveLambda,
      forward_model: forwardModel,
      chi2_tolerance: 0.05,
      rho_min_ohm_m: params.rhoMinOhmM ?? 0.1,
      rho_max_ohm_m: params.rhoMaxOhmM ?? 10_000,
      mesh_type: params.meshType ?? "trian",
      mesh_cl_factor: params.meshClFactor ?? (fastInvert ? 5 : 2),
      mesh_refine: fastInvert ? 0 : (params.meshRefine ?? 0),
      mesh_fmd_m: params.meshFmdM ?? null,
      tolerance: params.tolerance ?? 0.02,
      a_wgt: params.aWgt ?? 0.03,
      b_wgt: params.bWgt ?? 0,
      filter_reciprocal: params.filterReciprocal !== false,
      filter_negative: params.filterNegative !== false,
      filter_duplicates: params.filterDuplicates !== false,
      filter_pct_error: params.filterPctError ?? 15,
      crop_corners: params.cropCorners === true,
      doi_estimate: params.doiEstimate === true,
      apply_coverage_mask: params.cropCorners === true,
      contour_smooth_passes: params.contourSmoothPasses ?? 0,
      contour_smooth_sigma: 0.8,
      fast_invert: fastInvert,
    },
    method: effectiveMethod,
    invert_engine: backend,
    topography: topography?.map((t) => ({
      station_m: t.stationM,
      elevation_m: t.elevationM,
    })),
  };
}

/** Diagnóstico quando o JSON do motor não preenche o canvas. */
export function describePhysicsJsonIssue(data: PhysicsResponse): string | null {
  if (!data.ok) return data.error ?? "ok=false no JSON";
  const nx = data.nx ?? 0;
  const nz = data.nz ?? 0;
  const mLen = data.m_log10?.length ?? 0;
  const xLen = data.x_edges_m?.length ?? 0;
  const zLen = data.z_edges_m?.length ?? 0;
  if (!data.m_log10?.length) return "m_log10 ausente ou vazio";
  if (nx < 1 || nz < 1) return `nx/nz inválidos (${nx}×${nz})`;
  if (mLen !== nx * nz) {
    return `m_log10.length=${mLen} ≠ nx×nz (${nx * nz})`;
  }
  if (xLen !== nx + 1) return `x_edges_m.length=${xLen} (esperado ${nx + 1})`;
  if (zLen !== nz + 1) return `z_edges_m.length=${zLen} (esperado ${nz + 1})`;
  return null;
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
  const nx = data.nx ?? 0;
  const nz = data.nz ?? 0;
  const raw = cloneFloat64Array(data.m_log10);
  if (nx < 1 || nz < 1 || raw.length !== nx * nz) {
    console.error(
      "[physics-invert] modelo inconsistente:",
      { nx, nz, m_len: raw.length },
    );
    return null;
  }
  const { mLog10, invalidCount } = sanitizeModelLog10(raw);
  if (invalidCount > 0) {
    console.warn(
      `[physics-invert] ${invalidCount}/${raw.length} células m_log10 inválidas (NaN/Inf) — substituídas pela média`,
    );
  }
  return {
    mLog10,
    xEdgesM: cloneFloat64Array(data.x_edges_m),
    zEdgesM: cloneFloat64Array(data.z_edges_m),
    yObsLog10: cloneFloat64Array(data.y_obs_log10),
    ySynLog10: cloneFloat64Array(data.y_syn_log10),
    rmsLog10: data.rms_log10 ?? 0,
    rmsPercent: data.rms_percent,
    roughnessL2: data.roughness_l2 ?? 0,
    iterations: Math.max(
      data.iterations ?? 0,
      data.iteration_history?.length ?? 0,
    ),
    iterationHistory: normalizeIterationHistory(
      data.iteration_history as Array<Record<string, unknown>> | undefined,
    ),
    nx,
    nz,
    methodId: data.method ?? "blocky_l1",
    methodLabel: data.method_label ?? "FDM físico",
    engine: "physics",
    physicsMessage: data.message
      ? `[${data.engine ?? "motor"}] ${data.message}`
      : data.engine
        ? `[${data.engine}]`
        : undefined,
    progressLog: data.progress_log,
    excludedReadingIndices: data.excluded_indices,
    forwardModel: data.forward_model,
    chi2Reduced: data.chi2_reduced,
    chi2Target: data.chi2_target,
    ndData: data.nd_data,
    activeCells: data.active_cells,
    zCoverM: data.z_cover_m,
  };
}

function parsePhysicsErrorBody(data: Record<string, unknown>): string | null {
  if (typeof data.error === "string") return data.error;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((d) =>
        typeof d === "object" && d && "msg" in d
          ? String((d as { msg?: string }).msg)
          : JSON.stringify(d),
      )
      .join("; ");
  }
  return null;
}

function isUnknownMethod422(
  status: number,
  requestedMethod: Dipolo2DInvertMethodId,
  data: Record<string, unknown>,
): boolean {
  if (status !== 422 || requestedMethod !== "blocky_l1") return false;
  const msg = parsePhysicsErrorBody(data) ?? "";
  return (
    /literal_error|input should be/i.test(msg) ||
    /blocky_l1/i.test(msg) ||
    msg.includes("robust_l1")
  );
}

export async function invertDipolo2DPhysics(
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
  method: Dipolo2DInvertMethodId,
  topography?: TopographyPoint[],
  qcByRow?: Map<number, { qualityScore: number; isSpike: boolean }>,
  forwardModel: PhysicsForwardModelId = "fdm",
  res2dinvOptions?: Res2dinvPhysicsOptions,
): Promise<Dipolo2DInvertResult | null> {
  const active = readings.filter((r) => !r.excluded && r.rhoApparentOhmM > 0);
  if (active.length < 4) return null;

  let effectiveMethod = method;
  let payload = toPhysicsPayload(
    readings,
    params,
    effectiveMethod,
    topography,
    qcByRow,
    forwardModel,
    res2dinvOptions ?? { physicsBackend: "resipy" },
  );
  let body = JSON.stringify(payload);
  const signal = AbortSignal.timeout(1_200_000);
  const urls: { url: string; credentials: RequestCredentials }[] = [
    {
      url: `${PYTHON_HEALTH_URL}/invert`,
      credentials: "omit",
    },
    {
      url: `${PYTHON_HEALTH_URL}/api/v1/geophysics/invert/2d`,
      credentials: "omit",
    },
    {
      url: "/api/geofisica/invert/2d",
      credentials: "include",
    },
  ];

  let res: Response | null = null;
  let lastErr: Error | null = null;

  for (const { url, credentials } of urls) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials,
        signal,
      });
      break;
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!res) {
    const msg = lastErr?.message ?? "";
    if (/timeout|aborted/i.test(msg)) {
      throw new Error(
        forwardModel === "fem"
          ? "Inversão FEM excedeu o tempo. Mude para FDM (adjoint) — muito mais rápido."
          : "Inversão excedeu o tempo (~20 min). Reduza Células X/Z ou reinicie o motor.",
      );
    }
    throw new Error(
      "Não foi possível contactar o motor Python (:8092). Terminal: npm run geophysics:engine",
    );
  }

  let data = (await res.json().catch(() => ({}))) as PhysicsResponse & {
    error?: string;
    detail?: string | Array<{ msg?: string }>;
    engineStatus?: number;
  };

  if (
    !res.ok &&
    isUnknownMethod422(res.status, method, data as Record<string, unknown>)
  ) {
    effectiveMethod = "robust_l1";
    payload = toPhysicsPayload(
      readings,
      params,
      effectiveMethod,
      topography,
      qcByRow,
      forwardModel,
      res2dinvOptions ?? { physicsBackend: "resipy" },
    );
    body = JSON.stringify(payload);
    for (const { url, credentials } of urls) {
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          credentials,
          signal,
        });
        data = (await res.json().catch(() => ({}))) as typeof data;
        break;
      } catch {
        /* tenta próximo URL */
      }
    }
  }

  if (!res.ok || data.ok === false) {
    const detail = parsePhysicsErrorBody(data as Record<string, unknown>);
    if (method === "blocky_l1" && res.status === 422) {
      throw new Error(
        "Motor Python desatualizado (sem blocky_l1). Reinicie: npm run geophysics:kill-port && npm run geophysics:engine — ou use método Robusta L1.",
      );
    }
    throw new Error(
      detail ??
        data.error ??
        `Inversão física falhou (HTTP ${res.status})`,
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.debug("[physics-invert] response", {
      ok: data.ok,
      nx: data.nx,
      nz: data.nz,
      m_len: data.m_log10?.length,
      x_edges: data.x_edges_m?.length,
      z_edges: data.z_edges_m?.length,
      method: data.method,
    });
  }
  const mapped = mapPhysicsResponse(data);
  if (!mapped) {
    const jsonIssue = describePhysicsJsonIssue(data);
    throw new Error(
      jsonIssue
        ? `JSON do motor (:8092) inválido para o canvas — ${jsonIssue}. Reinicie: npm run geophysics:kill-port && npm run geophysics:engine`
        : (data.error ??
            "Motor respondeu sem modelo (m_log10 vazio). Reinicie o motor: npm run geophysics:kill-port && npm run geophysics:engine"),
    );
  }
  return mapped;
}

export type PhysicsEngineStatus = {
  online: boolean;
  error?: string;
};

const PYTHON_HEALTH_URL =
  process.env.NEXT_PUBLIC_GEOPHYSICS_ENGINE_URL ?? "http://127.0.0.1:8092";

/** Health directo no uvicorn (:8092) — não depende do Next.js. */
async function checkPythonEngineDirect(): Promise<boolean> {
  try {
    const res = await fetch(
      `${PYTHON_HEALTH_URL}/api/v1/geophysics/health`,
      {
        method: "GET",
        credentials: "omit",
        signal: AbortSignal.timeout(6_000),
        cache: "no-store",
      },
    );
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

/** Motor FDM/FEM (:8092). Health directo; inversão POST via API Next (`npm run dev`). */
export async function checkPhysicsEngineOnline(): Promise<PhysicsEngineStatus> {
  const directOk = await checkPythonEngineDirect();
  if (directOk) {
    return { online: true };
  }

  try {
    const res = await fetch("/api/geofisica/invert/2d", {
      method: "GET",
      credentials: "include",
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      online?: boolean;
      error?: string;
    };
    if (res.ok && data.online === true) {
      return { online: true };
    }
    return {
      online: false,
      error:
        data.error ??
        (res.status === 503
          ? "Motor Python não respondeu na porta 8092."
          : `Verificação falhou (HTTP ${res.status}).`),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro de rede";
    if (/timeout|timed out|aborted/i.test(msg)) {
      return {
        online: false,
        error:
          "Motor Python não responde em :8092 (timeout). Terminal: npm run geophysics:kill-port && npm run geophysics:engine",
      };
    }
    return {
      online: false,
      error: /fetch failed|Failed to fetch|NetworkError/i.test(msg)
        ? "Motor offline e Next.js inacessível. Abra dois terminais: geophysics:engine e npm run dev."
        : msg,
    };
  }
}

export { physicsMeshSize };

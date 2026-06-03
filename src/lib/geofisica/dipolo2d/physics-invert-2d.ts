import type { TopographyPoint } from "./topography-types";
import { sanitizeModelLog10 } from "./model-visual-scale";
import type {
  Dipolo2DInvertMethodId,
  Dipolo2DInvertParams,
  Dipolo2DInvertResult,
  Dipolo2DReading,
} from "./types";

export type InvertEngineId = "proxy" | "physics";

export type PhysicsForwardModelId = "fdm" | "fem";

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
  forward_model?: PhysicsForwardModelId;
  chi2_reduced?: number;
  chi2_target?: number;
  nd_data?: number;
  active_cells?: boolean[];
  z_cover_m?: number[];
};

function physicsMeshSize(
  p: Dipolo2DInvertParams,
  forwardModel: PhysicsForwardModelId = "fdm",
): Pick<Dipolo2DInvertParams, "nx" | "nz"> {
  if (forwardModel === "fem") {
    return {
      nx: Math.min(Math.max(p.nx, 24), 36),
      nz: Math.min(Math.max(p.nz, 16), 24),
    };
  }
  return {
    nx: Math.min(Math.max(p.nx, 24), 40),
    nz: Math.min(Math.max(p.nz, 14), 22),
  };
}

function toPhysicsPayload(
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
  method: Dipolo2DInvertMethodId,
  topography: TopographyPoint[] | undefined,
  qcByRow: Map<number, { qualityScore: number; isSpike: boolean }> | undefined,
  forwardModel: PhysicsForwardModelId = "fdm",
) {
  const mesh = physicsMeshSize(params, forwardModel);
  const maxIter =
    forwardModel === "fem"
      ? Math.min(Math.max(params.maxIter, 12), 24)
      : Math.min(Math.max(params.maxIter, 12), 28);
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
      lambda_x: params.lambdaX ?? 0.1,
      lambda_z: params.lambdaZ ?? 0.4,
      lambda_min: params.lambdaMin,
      lambda_decay: params.lambdaDecay,
      max_iter: maxIter,
      huber_c: params.huberC,
      min_improvement: params.minImprovement,
      target_rms_log10: 0.035,
      hybrid_alpha: params.hybridAlpha ?? 0.65,
      auto_exclude_outliers: false,
      outlier_score_threshold: 35,
      use_adaptive_mesh: false,
      apply_coverage_mask: false,
      use_line_search: method !== "gauss_newton",
      trust_region_alpha: 0.35,
      geometric_z_layers: true,
      min_iter_before_stop: 4,
      reg_normalize_mesh: true,
      irls_inner_iters: 2,
      jacobian_mode: "fd" as const,
      forward_model: forwardModel,
      chi2_tolerance: 0.05,
    },
    method,
    invert_engine: "pygimli",
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
  const raw = Float64Array.from(data.m_log10);
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
    xEdgesM: Float64Array.from(data.x_edges_m),
    zEdgesM: Float64Array.from(data.z_edges_m),
    yObsLog10: Float64Array.from(data.y_obs_log10),
    ySynLog10: Float64Array.from(data.y_syn_log10),
    rmsLog10: data.rms_log10 ?? 0,
    rmsPercent: data.rms_percent,
    roughnessL2: data.roughness_l2 ?? 0,
    iterations: Math.max(
      data.iterations ?? 0,
      data.iteration_history?.length ?? 0,
    ),
    iterationHistory: data.iteration_history ?? [],
    nx,
    nz,
    methodId: data.method ?? "gauss_newton",
    methodLabel: data.method_label ?? "FDM físico",
    engine: "physics",
    physicsMessage: data.message
      ? `[${data.engine ?? "motor"}] ${data.message}`
      : data.engine
        ? `[${data.engine}]`
        : undefined,
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
  );
  let body = JSON.stringify(payload);
  const signal = AbortSignal.timeout(1_200_000);
  const urls: { url: string; credentials: RequestCredentials }[] = [
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

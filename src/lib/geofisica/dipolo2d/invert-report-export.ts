import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "./types";

function rmsFromRes(res: number[], nd: number): number {
  let sse = 0;
  for (let d = 0; d < nd; d++) sse += res[d]! * res[d]!;
  return Math.sqrt(sse / Math.max(1, nd));
}

/** Relatório texto estilo x2ipi / RES2DINV (cabeçalho + iterações + resíduos). */
export function buildInvertReportTxt(
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
  result: Dipolo2DInvertResult,
  label = "DataGeo Dipolo-Dipolo 2D",
): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();
  lines.push(`# ${label}`);
  lines.push(`# Gerado: ${ts}`);
  lines.push(
    `# Método: dipolo-dipolo, ${result.methodLabel} (${result.methodId}), log10(rho)`,
  );
  lines.push("");
  lines.push("[PARAMETROS]");
  lines.push(`factor_depth\t${params.factorDepth}`);
  lines.push(`sigma_x_m\t${params.sigmaXM}`);
  lines.push(`sigma_z_m\t${params.sigmaZM}`);
  lines.push(`lambda_ini\t${params.lambda}`);
  lines.push(`lambda_min\t${params.lambdaMin}`);
  lines.push(`lambda_decay\t${params.lambdaDecay}`);
  lines.push(`huber_c\t${params.huberC}`);
  lines.push(`max_iter\t${params.maxIter}`);
  lines.push(`mesh_nx\t${params.nx}`);
  lines.push(`mesh_nz\t${params.nz}`);
  lines.push("");
  lines.push("[RESULTADO_FINAL]");
  lines.push(`iteracoes\t${result.iterations}`);
  lines.push(`rms_log10_rhoa\t${result.rmsLog10.toExponential(6)}`);
  lines.push(`roughness_l2\t${result.roughnessL2.toExponential(6)}`);
  lines.push(`malha\t${result.nx}x${result.nz}`);
  lines.push("");
  lines.push("[ITERACOES]");
  lines.push("iter\trms_log10\tlambda\tphi\troughness_l2\tganho_rel");
  for (const row of result.iterationHistory) {
    lines.push(
      `${row.iter}\t${row.rmsLog10.toExponential(6)}\t${row.lambda.toExponential(4)}\t${row.phi.toExponential(6)}\t${row.roughnessL2.toExponential(6)}\t${row.relativeGain != null ? row.relativeGain.toExponential(4) : ""}`,
    );
  }
  lines.push("");
  lines.push("[RESIDUOS_LEITURAS]");
  lines.push("idx\tstation_m\ta_m\tn\trhoa_obs\trhoa_calc\tres_log10");
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i]!;
    const obs = 10 ** result.yObsLog10[i]!;
    const calc = 10 ** result.ySynLog10[i]!;
    const res = result.yObsLog10[i]! - result.ySynLog10[i]!;
    lines.push(
      `${i + 1}\t${r.stationM}\t${r.aM}\t${r.n}\t${obs.toExponential(6)}\t${calc.toExponential(6)}\t${res.toExponential(6)}`,
    );
  }
  lines.push("");
  lines.push("[MODELO_CELULAS]");
  lines.push("i\tj\tx_center_m\tz_center_m\tlog10_rho\trho_ohm_m");
  const nx = result.nx;
  const nz = result.nz;
  const dx =
    (result.xEdgesM[nx]! - result.xEdgesM[0]!) / Math.max(1, nx);
  const dz = result.zEdgesM[nz]! / Math.max(1, nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const k = i * nz + j;
      const logR = result.mLog10[k]!;
      const xc = result.xEdgesM[i]! + dx * 0.5;
      const zc = result.zEdgesM[j]! + dz * 0.5;
      lines.push(
        `${i + 1}\t${j + 1}\t${xc.toFixed(4)}\t${zc.toFixed(4)}\t${logR.toExponential(6)}\t${(10 ** logR).toExponential(6)}`,
      );
    }
  }
  return lines.join("\n");
}

/** Formato .dat compacto (compatível com importação tabular). */
export function buildInvertReportDat(
  readings: Dipolo2DReading[],
  params: Dipolo2DInvertParams,
  result: Dipolo2DInvertResult,
): string {
  const lines: string[] = [];
  lines.push("DATAGEO_DIPOLO2D_INVERSION");
  lines.push(`NDATA ${readings.length}`);
  lines.push(`NITER ${result.iterations}`);
  lines.push(`RMS ${result.rmsLog10}`);
  lines.push(`NX ${result.nx}`);
  lines.push(`NZ ${result.nz}`);
  lines.push("ITER RMS LAMBDA PHI ROUGH");
  for (const row of result.iterationHistory) {
    lines.push(
      `${row.iter} ${row.rmsLog10} ${row.lambda} ${row.phi} ${row.roughnessL2}`,
    );
  }
  lines.push("DATA STATION A N RHOA_OBS RHOA_CALC RES_LOG10");
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i]!;
    lines.push(
      `${r.stationM} ${r.aM} ${r.n} ${10 ** result.yObsLog10[i]!} ${10 ** result.ySynLog10[i]!} ${result.yObsLog10[i]! - result.ySynLog10[i]!}`,
    );
  }
  lines.push("MODEL I J LOG10_RHO");
  const nz = result.nz;
  for (let i = 0; i < result.nx; i++) {
    for (let j = 0; j < nz; j++) {
      lines.push(`${i + 1} ${j + 1} ${result.mLog10[i * nz + j]}`);
    }
  }
  void params;
  return lines.join("\n");
}

export function rmsLog10FromArrays(
  yObs: Float64Array | number[],
  ySyn: Float64Array | number[],
): number {
  const nd = Math.min(yObs.length, ySyn.length);
  const res: number[] = [];
  for (let d = 0; d < nd; d++) res.push(yObs[d]! - ySyn[d]!);
  return rmsFromRes(res, nd);
}

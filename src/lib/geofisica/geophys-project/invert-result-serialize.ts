import type {
  Dipolo2DInvertResult,
  Dipolo2DIterationRecord,
} from "../dipolo2d/types";
import { cloneFloat64Array } from "../dipolo2d/model-visual-scale";

/** Formato JSON para persistir o modelo invertido do Dipolo-Dipolo. */
export type SerializedDipolo2DInvertResult = {
  mLog10: number[];
  xEdgesM: number[];
  zEdgesM: number[];
  yObsLog10: number[];
  ySynLog10: number[];
  rmsLog10: number;
  roughnessL2: number;
  iterations: number;
  iterationHistory: Dipolo2DIterationRecord[];
  nx: number;
  nz: number;
  methodId: Dipolo2DInvertResult["methodId"];
  methodLabel: string;
};

export function serializeInvertResult(
  result: Dipolo2DInvertResult,
): SerializedDipolo2DInvertResult {
  return {
    mLog10: Array.from(result.mLog10),
    xEdgesM: Array.from(result.xEdgesM),
    zEdgesM: Array.from(result.zEdgesM),
    yObsLog10: Array.from(result.yObsLog10),
    ySynLog10: Array.from(result.ySynLog10),
    rmsLog10: result.rmsLog10,
    roughnessL2: result.roughnessL2,
    iterations: result.iterations,
    iterationHistory: result.iterationHistory.map((h) => ({ ...h })),
    nx: result.nx,
    nz: result.nz,
    methodId: result.methodId,
    methodLabel: result.methodLabel,
  };
}

export function deserializeInvertResult(
  data: SerializedDipolo2DInvertResult,
): Dipolo2DInvertResult {
  return {
    mLog10: cloneFloat64Array(data.mLog10),
    xEdgesM: cloneFloat64Array(data.xEdgesM),
    zEdgesM: cloneFloat64Array(data.zEdgesM),
    yObsLog10: cloneFloat64Array(data.yObsLog10),
    ySynLog10: cloneFloat64Array(data.ySynLog10),
    rmsLog10: data.rmsLog10,
    roughnessL2: data.roughnessL2,
    iterations: data.iterations,
    iterationHistory: data.iterationHistory.map((h) => ({ ...h })),
    nx: data.nx,
    nz: data.nz,
    methodId: data.methodId,
    methodLabel: data.methodLabel,
  };
}

export function invertResultDepthM(result: Dipolo2DInvertResult): number {
  const nz = result.nz;
  return (
    result.zEdgesM[nz] ??
    result.zEdgesM[result.zEdgesM.length - 1] ??
    0
  );
}

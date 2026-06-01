import type {
  SpectralIndex,
  TemporalAiResult,
  TemporalAiTarget,
  TemporalChangeAnalysis,
  Wgs84Bbox,
} from "../temporal-types";
import { TEMPORAL_AI_TARGET_LABELS } from "../temporal-types";

export type AiDetectionInput = {
  change: TemporalChangeAnalysis;
  bbox: Wgs84Bbox;
  targets: TemporalAiTarget[];
};

function bboxAreaHa(b: Wgs84Bbox): number {
  const latMid = (b.north + b.south) / 2;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((latMid * Math.PI) / 180);
  const w = (b.east - b.west) * mPerDegLng;
  const h = (b.north - b.south) * mPerDegLat;
  return (w * h) / 10_000;
}

function ruleBasedDetections(input: AiDetectionInput): TemporalAiResult {
  const { change, bbox, targets } = input;
  const areaHa = bboxAreaHa(bbox);
  const detections = targets.map((target) => {
    const baseConf = Math.min(0.95, change.changePct / 40 + change.meanDelta);
    let conf = baseConf;
    let areaFactor = 0.15;

    switch (target) {
      case "vegetation_change":
        conf =
          change.index === "ndvi" ? baseConf * 1.2 : baseConf * 0.6;
        areaFactor = change.changePct > 15 ? 0.25 : 0.1;
        break;
      case "geological_alteration":
      case "mineralization":
        conf =
          change.index === "iron_oxide" || change.index === "clay_alteration"
            ? baseConf * 1.15
            : baseConf * 0.7;
        areaFactor = 0.12;
        break;
      case "paleochannels":
        conf = change.index === "ndwi" ? baseConf * 1.1 : baseConf * 0.55;
        areaFactor = 0.08;
        break;
      case "slope_movement":
      case "erosion_expansion":
        conf = change.changePct > 10 ? baseConf * 1.05 : baseConf * 0.5;
        areaFactor = 0.18;
        break;
    }

    conf = Math.min(0.98, Math.max(0.2, conf));

    return {
      target,
      label: TEMPORAL_AI_TARGET_LABELS[target],
      confidence: conf,
      areaHa: areaHa * areaFactor,
      bounds: shrinkBbox(bbox, 0.15 + (1 - conf) * 0.2),
      summary: buildTargetSummary(target, change, conf),
    };
  });

  return {
    detections,
    summary: `Análise ${change.dateA} → ${change.dateB} (${change.index}): ${change.changePct.toFixed(1)}% de pixels alterados. ${detections.filter((d) => d.confidence > 0.55).length} alvo(s) com confiança moderada/alta.`,
    method: "spectral_rules",
  };
}

function shrinkBbox(b: Wgs84Bbox, margin: number): Wgs84Bbox {
  const dw = (b.east - b.west) * margin;
  const dh = (b.north - b.south) * margin;
  return {
    west: b.west + dw,
    east: b.east - dw,
    south: b.south + dh,
    north: b.north - dh,
  };
}

function buildTargetSummary(
  target: TemporalAiTarget,
  change: TemporalChangeAnalysis,
  conf: number,
): string {
  const pct = change.changePct.toFixed(1);
  const base = `Confiança ${(conf * 100).toFixed(0)}% · ${pct}% área com mudança espectral.`;
  switch (target) {
    case "vegetation_change":
      return `${base} Padrão compatível com variação NDVI entre datas.`;
    case "geological_alteration":
      return `${base} Assinatura de alteração hidrotermal / oxidação.`;
    case "mineralization":
      return `${base} Anomalia em razões ferro/argila — investigar amostragem.`;
    case "paleochannels":
      return `${base} Linearidade de umidade/vegetação sugerindo paleodrenagem.`;
    case "slope_movement":
      return `${base} Deslocamento de cobertura / exposição de solo.`;
    case "erosion_expansion":
      return `${base} Expansão de áreas erodidas ou desnudadas.`;
  }
}

/** TensorFlow.js — detecção por convolução sobre mapa de mudança. */
export async function runTensorFlowDetection(
  input: AiDetectionInput,
): Promise<TemporalAiResult> {
  const rules = ruleBasedDetections(input);
  try {
    const tf = await import("@tensorflow/tfjs");
    const { nx, ny, values } = input.change.heatmapGrid;
    const tensor = tf.tensor2d(values, [ny, nx]).expandDims(0).expandDims(-1);
    const kernel = tf.ones([3, 3, 1, 1]).div(9);
    const smoothed = tf.conv2d(
      tensor as import("@tensorflow/tfjs").Tensor4D,
      kernel as import("@tensorflow/tfjs").Tensor4D,
      1,
      "same",
    );
    const mean = smoothed.mean().dataSync()[0] ?? 0;
    const max = smoothed.max().dataSync()[0] ?? 0;
    tensor.dispose();
    kernel.dispose();
    smoothed.dispose();

    const boost = Math.min(0.15, max - mean);
    return {
      ...rules,
      method: "hybrid",
      detections: rules.detections.map((d) => ({
        ...d,
        confidence: Math.min(0.99, d.confidence + boost),
      })),
      summary: `${rules.summary} Refinamento TF.js: energia de mudança ${(max * 100).toFixed(1)}%.`,
    };
  } catch {
    return rules;
  }
}

export async function analyzeTemporalAi(
  input: AiDetectionInput,
  useTensorFlow = true,
): Promise<TemporalAiResult> {
  if (useTensorFlow && typeof window !== "undefined") {
    return runTensorFlowDetection(input);
  }
  return ruleBasedDetections(input);
}

export { ruleBasedDetections };

import type { CamadaEstratigrafica } from "@/components/perfil-estratigrafico";
import type { Dipolo2DInvertParams, Dipolo2DInvertResult, Dipolo2DReading } from "./types";
import type {
  GeologicContactLine,
  GeologicLayerUnit,
  InterpretedColumn,
  InvertCellSummary,
  RegionalGeologyProfile,
  SectionGeologicInterpretation,
} from "./interpret-types";
import type { LayerUnit } from "./profile-layer-segmentation";
import { assignFormationsToLayers } from "./formation-assignment";
import {
  buildGeotechnicalLayerGrid,
  maskLayerGridToCoverage,
} from "./geotechnical-layer-grid";
import {
  attachResistivityNorm,
  formatNormLegend,
} from "./resistivity-norms-br";
import type { ResistivityRefRow } from "./resistivity-reference-table-br";
import { userTableToNormProfile } from "./resistivity-reference-table-br";
import { buildReferenceTableTxt } from "./resistivity-reference-table-br";
import {
  columnLayersFromGrid,
  extractContactLines,
  extractVisibleCells,
} from "./profile-layer-segmentation";

function maxPseudoDepthAtX(
  readings: Dipolo2DReading[],
  xCenter: number,
  halfWidth: number,
  factorDepth: number,
): number {
  let zMax = 0;
  for (const r of readings) {
    if (Math.abs(r.stationM - xCenter) > halfWidth) continue;
    zMax = Math.max(zMax, factorDepth * r.n * r.aM);
  }
  return zMax;
}

function buildColumn(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  i: number,
  layerId: Int32Array,
  units: LayerUnit[],
): InterpretedColumn | null {
  const nx = result.nx;
  const nz = result.nz;
  if (i < 0 || i >= nx) return null;

  const dx = (result.xEdgesM[nx]! - result.xEdgesM[0]!) / Math.max(1, nx);
  const xCenter = result.xEdgesM[i]! + dx * 0.5;
  const zCover = readings.length
    ? maxPseudoDepthAtX(readings, xCenter, dx * 0.75, params.factorDepth)
    : result.zEdgesM[nz]!;
  const dz = result.zEdgesM[nz]! / Math.max(1, nz);

  const layers: CamadaEstratigrafica[] = [];
  const samples: InterpretedColumn["samples"] = [];
  const colLayers = columnLayersFromGrid(
    result,
    params,
    readings,
    layerId,
    units,
    i,
  );

  for (const u of colLayers) {
    layers.push({
      topo: u.topo,
      base: u.base,
      cor: u.cor,
      material: u.material,
    });
  }

  for (let j = 0; j < nz; j++) {
    const lid = layerId[i * nz + j]!;
    if (lid < 0) continue;
    const zMid = result.zEdgesM[j]! + dz * 0.5;
    if (zMid > zCover) continue;
    const rho = 10 ** result.mLog10[i * nz + j]!;
    const mat = layers.find((L) => zMid >= L.topo && zMid < L.base)?.material ?? "?";
    samples.push({ zM: zMid, rhoOhmM: rho, material: mat, confidence: 0.85 });
  }

  if (!layers.length) return null;
  return { stationM: xCenter, xIndex: i, layers, samples };
}

/** Resumo estatístico das células visíveis (para API / relatório). */
export function summarizeInvertCells(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
): InvertCellSummary {
  const cells = extractVisibleCells(result, params, readings);
  const rhos = cells.map((c) => c.rhoOhmM).sort((a, b) => a - b);
  if (!rhos.length) {
    return {
      rhoMinOhmM: 1,
      rhoMaxOhmM: 1000,
      rhoMedianOhmM: 100,
      depthMaxM: 0,
      stationMinM: 0,
      stationMaxM: 0,
      sampleCount: 0,
    };
  }
  const xs = cells.map((c) => c.xM);
  return {
    rhoMinOhmM: rhos[0]!,
    rhoMaxOhmM: rhos[rhos.length - 1]!,
    rhoMedianOhmM: rhos[Math.floor(rhos.length / 2)]!,
    depthMaxM: Math.max(...cells.map((c) => c.zM)),
    stationMinM: Math.min(...xs),
    stationMaxM: Math.max(...xs),
    sampleCount: rhos.length,
  };
}

function buildNarrative(
  regional: RegionalGeologyProfile,
  rep: InterpretedColumn,
  summary: InvertCellSummary,
  units: GeologicLayerUnit[],
  contacts: GeologicContactLine[],
  normLegend: string,
): string {
  const layerList = rep.layers
    .map((L) => `${L.topo.toFixed(1)}–${L.base.toFixed(1)} m: ${L.material}`)
    .join("; ");
  const unitList = units
    .map(
      (u) =>
        `${u.label}: ${u.material} (ρ̄≈${u.meanRhoOhmM.toFixed(0)} Ω·m, ${u.cellCount} células)`,
    )
    .join("; ");
  return [
    `Região: ${regional.regionName}.`,
    `Classificação ρ (norma): ${normLegend}.`,
    `Classificação 2D por ρ: ${units.length} classes geotécnicas, ${contacts.length} famílias de contato.`,
    `Unidades: ${unitList}.`,
    `Coluna central (est. ${rep.stationM.toFixed(0)} m): ${layerList || "—"}.`,
    `ρ no perfil: ${summary.rhoMinOhmM.toFixed(0)}–${summary.rhoMaxOhmM.toFixed(0)} Ω·m (mediana ${summary.rhoMedianOhmM.toFixed(0)}).`,
    "Contatos traçados nas fronteiras de contraste de resistividade; validar em campo.",
  ].join(" ");
}

/**
 * Interpreta a secção invertida segmentando o perfil de ρ e classificando camadas.
 */
export function interpretInvertedSection(
  result: Dipolo2DInvertResult,
  params: Dipolo2DInvertParams,
  readings: Dipolo2DReading[],
  regional: RegionalGeologyProfile,
  classificationTable: ResistivityRefRow[],
): SectionGeologicInterpretation {
  const nx = result.nx;
  const lat = regional.anchorLat ?? -26.28;
  const lng = regional.anchorLng ?? -48.67;
  const resistivityNorm =
    classificationTable.length > 0
      ? userTableToNormProfile(classificationTable)
      : attachResistivityNorm(lat, lng, regional.resistivityNorm);

  const { layerId, units, logLo, logHi } = buildGeotechnicalLayerGrid(
    result,
    resistivityNorm,
    // Prioriza a tabela do utilizador: menos suavização e sem override de intrusão.
    { smoothPasses: 1, detectIntrusion: false },
  );

  maskLayerGridToCoverage(
    layerId,
    result.nx,
    result.nz,
    result.xEdgesM,
    result.zEdgesM,
    readings,
    params.factorDepth,
  );

  const namedUnits = assignFormationsToLayers(
    result,
    params,
    readings,
    regional,
    layerId,
    units,
    resistivityNorm,
  );

  const layerUnits: GeologicLayerUnit[] = namedUnits.map((u) => ({
    id: u.id,
    label: u.label,
    material: u.material,
    cor: u.cor,
    meanRhoOhmM: u.meanRhoOhmM,
    cellCount: u.cellCount,
  }));

  const contactLines = extractContactLines(
    result,
    params,
    readings,
    layerId,
    namedUnits,
  );

  const columns: InterpretedColumn[] = [];
  const step = nx > 12 ? Math.ceil(nx / 8) : 1;
  for (let i = 0; i < nx; i += step) {
    const col = buildColumn(result, params, readings, i, layerId, namedUnits);
    if (col) columns.push(col);
  }

  const centerI = Math.floor(nx / 2);
  const repLayers = columnLayersFromGrid(
    result,
    params,
    readings,
    layerId,
    namedUnits,
    centerI,
  );
  const dx = (result.xEdgesM[nx]! - result.xEdgesM[0]!) / Math.max(1, nx);
  const representative: InterpretedColumn = {
    stationM: result.xEdgesM[centerI]! + dx * 0.5,
    xIndex: centerI,
    layers: repLayers.map((L) => ({
      topo: L.topo,
      base: L.base,
      cor: L.cor,
      material: L.material,
    })),
    samples: columns.find((c) => c.xIndex === centerI)?.samples ?? [],
  };

  const summary = summarizeInvertCells(result, params, readings);

  return {
    regional,
    columns,
    representative,
    layerUnits,
    contactLines,
    logRhoLo: logLo,
    logRhoHi: logHi,
    layerGrid: [...layerId],
    gridNx: nx,
    gridNz: result.nz,
    narrative: buildNarrative(
      regional,
      representative,
      summary,
      layerUnits,
      contactLines,
      formatNormLegend(resistivityNorm),
    ),
    resistivityNorm,
    classificationTable: classificationTable.map((r) => ({ ...r })),
    generatedAt: new Date().toISOString(),
  };
}

export function buildInterpretReportTxt(interp: SectionGeologicInterpretation): string {
  const lines: string[] = [
    "# Interpretação geológica — Dipolo-Dipolo 2D",
    `# Gerado: ${interp.generatedAt}`,
    "",
    "[REGIONAL]",
    `regiao\t${interp.regional.regionName}`,
    `fonte\t${interp.regional.source}`,
    `servicos\t${(interp.regional.dataSources ?? []).join("; ")}`,
    "",
    "[UNIDADES_MAPA]",
    "fonte\tsigla\tnome\tlitologia\tidade",
    ...(interp.regional.mapUnits ?? []).map(
      (u) =>
        `${u.source}\t${u.sigla ?? ""}\t${u.name}\t${u.lithology ?? ""}\t${u.age ?? ""}`,
    ),
    "",
    "[CAMADAS_PERFIL]",
    "id\tmaterial\trho_media_ohm_m\tcelulas",
    ...interp.layerUnits.map(
      (u) =>
        `${u.id + 1}\t${u.material}\t${u.meanRhoOhmM.toFixed(1)}\t${u.cellCount}`,
    ),
    "",
    "[CONTATOS]",
    "acima\tabaixo\tpontos",
    ...interp.contactLines.map(
      (c) =>
        `${c.layerAbove}\t${c.layerBelow}\t${c.points.length} vértices`,
    ),
    "",
    "[COLUNA_REPRESENTATIVA]",
    "topo_m\tbase_m\tmaterial",
    ...interp.representative.layers.map(
      (L) => `${L.topo.toFixed(2)}\t${L.base.toFixed(2)}\t${L.material}`,
    ),
    "",
    "[NORMA_RESISTIVIDADE]",
    `perfil\t${interp.resistivityNorm.name}`,
    `fonte\t${interp.resistivityNorm.source}`,
    `faixas\t${formatNormLegend(interp.resistivityNorm)}`,
    "",
    "[TABELA_CLASSIFICACAO_UTILIZADA]",
    "meio_fisico\trho_min_ohm_m\trho_max_ohm_m",
    ...interp.classificationTable.map(
      (r) =>
        `${r.meio}\t${r.rhoMinOhmM ?? ""}\t${r.rhoMaxOhmM ?? ""}`,
    ),
    "",
    "[TABELA_REFERENCIA_LITOLOGICA]",
    buildReferenceTableTxt(),
    "",
    "[NARRATIVA]",
    interp.narrative,
    ...(interp.fieldNotes ? ["", "[VALIDACAO_CAMPO]", interp.fieldNotes] : []),
    ...(interp.aiConfidence
      ? ["", `[CONFIANCA_IA]\t${interp.aiConfidence}`]
      : []),
  ];
  return lines.join("\n");
}

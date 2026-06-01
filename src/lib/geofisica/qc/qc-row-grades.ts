import { solodataLinhaToReadings } from "../dipolo2d/solodata-linha-readings";
import type { SolodataLinhaState } from "../dipolo2d/solodata-linha-types";
import { analyzeLineQc, readingsToQcInput } from "./qc-analyze";
import type { QcGrade } from "./qc-types";
import { QC_GRADE_COLORS } from "./qc-types";

export type RowQcGrade = {
  grade: QcGrade;
  isSpike: boolean;
  qualityScore: number;
  tooltip: string;
};

/** Classificação QC por índice de linha da planilha SOLODATA (SNR local por leitura). */
export function qcGradesByRowIndex(
  state: SolodataLinhaState,
  defaultAM: number,
): Map<number, RowQcGrade> {
  const readings = solodataLinhaToReadings(state, defaultAM);
  const active = readings.filter((r) => !r.excluded && r.rhoApparentOhmM > 0);
  if (active.length < 2) return new Map();

  const sorted = [...active].sort((a, b) => a.stationM - b.stationM);
  const metrics = analyzeLineQc(
    readingsToQcInput(
      "sheet",
      state.meta.linha || state.meta.titulo || "Linha",
      readings,
    ),
  );

  const out = new Map<number, RowQcGrade>();
  sorted.forEach((reading, i) => {
    const pt = metrics.readingPoints[i];
    const rowIdx = reading.sourceRowIndex;
    if (pt == null || rowIdx == null) return;
    const label = QC_GRADE_COLORS[pt.grade].label;
    const spike = pt.isSpike ? " — spike detectado" : "";
    out.set(rowIdx, {
      grade: pt.grade,
      isSpike: pt.isSpike,
      qualityScore: pt.qualityScore,
      tooltip: `QC: ${label} · score ${pt.qualityScore.toFixed(0)}/100 (linha ${metrics.qualityScore.toFixed(0)})${spike}`,
    });
  });
  return out;
}

export function lineQcFromSheet(
  state: SolodataLinhaState,
  defaultAM: number,
) {
  const readings = solodataLinhaToReadings(state, defaultAM);
  if (readings.filter((r) => !r.excluded && r.rhoApparentOhmM > 0).length < 2) {
    return null;
  }
  return analyzeLineQc(
    readingsToQcInput(
      "sheet",
      state.meta.linha || state.meta.titulo || "Linha",
      readings,
    ),
  );
}

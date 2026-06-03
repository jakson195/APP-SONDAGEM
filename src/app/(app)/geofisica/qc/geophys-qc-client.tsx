"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { QcAiResult } from "@/lib/geofisica/ai/qc-interpret-ai";
import { ruleBasedQcAi } from "@/lib/geofisica/ai/qc-interpret-ai";
import {
  parseDipoloImportFile,
  parseRes2dinvDatWithTopography,
} from "@/lib/geofisica/dipolo2d/parse-dipolo-import";
import { res2dinvToSolodataLinha } from "@/lib/geofisica/dipolo2d/parse-res2dinv-dat";
import { solodataLinhaToReadings } from "@/lib/geofisica/dipolo2d/solodata-linha-readings";
import { loadSolodataLinha12Demo } from "@/lib/geofisica/dipolo2d/solodata-linha-demo";
import type { SolodataLinhaState } from "@/lib/geofisica/dipolo2d/solodata-linha-types";
import type { GeoSurveyLocation } from "@/lib/geofisica/dipolo2d/interpret-types";
import { GARUVA_DEFAULT_LOCATION } from "@/lib/geofisica/dipolo2d/regional-geology";
import {
  consumePendingQcLoad,
  loadGeophysProject,
  type SavedGeophysSection,
} from "@/lib/geofisica/geophys-project/geophys-project-storage";
import {
  readingsToQcSurveyLine,
  savedSectionsToQcLines,
} from "@/lib/geofisica/geophys-project/saved-section-to-qc-line";
import {
  registerLineFromReadings,
  registerLineFromRes2dinv,
} from "@/lib/geofisica/volume3d/line-auto-register";
import {
  analyzeSurveyQc,
  readingsToQcInput,
} from "@/lib/geofisica/qc/qc-analyze";
import type { SurveyQcReport } from "@/lib/geofisica/qc/qc-types";
import {
  defaultQcLine,
  type QcSurveyLine,
} from "@/lib/geofisica/qc/qc-survey-types";
import { QC_GRADE_COLORS } from "@/lib/geofisica/qc/qc-types";
import { useGeofisicaObra } from "@/hooks/use-geofisica-obra";
import { GeophysSectionsPanel } from "../geophys-sections-panel";
import { QcLegend } from "./qc-legend";
import { QcMapPanel } from "./qc-map-panel";
import { QcPanel } from "./qc-panel";

const DIPOLO_STORAGE = "datageo-digital-geofisica-dipolo2d-v5";

function linhaToSurveyLine(
  linha: SolodataLinhaState,
  location: GeoSurveyLocation,
  defaultA = 15,
  lineIndex = 0,
): QcSurveyLine {
  const readings = solodataLinhaToReadings(linha, defaultA);
  const reg = registerLineFromReadings(
    readings,
    undefined,
    lineIndex,
    50,
    location,
  );
  return readingsToQcSurveyLine(
    readings,
    linha.meta.linha || linha.meta.titulo || "Linha importada",
    reg.geometry,
    { lineLengthM: reg.lineLengthM, azimuthDeg: reg.azimuthDeg },
  );
}

function applyQcLines(
  setLines: Dispatch<SetStateAction<QcSurveyLine[]>>,
  setActiveLineId: Dispatch<SetStateAction<string | null>>,
  setReport: Dispatch<SetStateAction<SurveyQcReport | null>>,
  setAi: Dispatch<SetStateAction<QcAiResult | null>>,
  newLines: QcSurveyLine[],
  mode: "replace" | "append",
) {
  setLines((prev) => {
    const merged =
      mode === "append"
        ? [
            ...prev.filter((l) => l.readings.length > 0),
            ...newLines,
          ]
        : newLines;
    return merged.length > 0 ? merged : newLines;
  });
  setActiveLineId(newLines[0]?.id ?? null);
  setReport(null);
  setAi(null);
}

export function GeophysQcClient() {
  const { selectedObraId } = useGeofisicaObra();
  const [lines, setLines] = useState<QcSurveyLine[]>(() => [defaultQcLine()]);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [report, setReport] = useState<SurveyQcReport | null>(null);
  const [ai, setAi] = useState<QcAiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [usePython, setUsePython] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [sectionsVersion, setSectionsVersion] = useState(0);

  const activeLineIdResolved = activeLineId ?? lines[0]?.id ?? null;

  const activeMetrics = useMemo(() => {
    if (!report || !activeLineIdResolved) return null;
    return report.lines.find((l) => l.lineId === activeLineIdResolved) ?? null;
  }, [report, activeLineIdResolved]);

  const runAnalysis = useCallback(async () => {
    const inputs = lines
      .filter((l) => l.readings.length > 0)
      .map((l) => readingsToQcInput(l.id, l.name, l.readings));

    if (inputs.length === 0) {
      setNotice("Adicione leituras antes de analisar.");
      return;
    }

    let nextReport = analyzeSurveyQc(inputs);

    if (usePython) {
      try {
        const merged = await Promise.all(
          inputs.map(async (inp, i) => {
            const res = await fetch("/api/geofisica/qc/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                stations_m: inp.stationsM,
                rho_ohm_m: inp.rhoOhmM,
              }),
            });
            const data = (await res.json()) as {
              ok?: boolean;
              snr?: number;
              grade?: string;
            };
            if (!data.ok || !nextReport.lines[i]) return nextReport.lines[i]!;
            const line = nextReport.lines[i]!;
            return {
              ...line,
              snr: data.snr ?? line.snr,
              grade:
                data.grade === "green" ||
                data.grade === "yellow" ||
                data.grade === "red"
                  ? data.grade
                  : line.grade,
            };
          }),
        );
        nextReport = {
          ...nextReport,
          lines: merged,
          overallSnr:
            merged.reduce((a, l) => a + l.snr, 0) / Math.max(1, merged.length),
          overallQualityScore:
            merged.reduce((a, l) => a + l.qualityScore, 0) /
            Math.max(1, merged.length),
          overallGrade: merged.some((l) => l.grade === "red")
            ? "red"
            : merged.some((l) => l.grade === "yellow")
              ? "yellow"
              : "green",
        };
      } catch {
        /* fallback browser metrics */
      }
    }

    setReport(nextReport);
    setAi(ruleBasedQcAi(nextReport));
    if (!activeLineId && nextReport.lines[0]) {
      setActiveLineId(nextReport.lines[0].lineId);
    }
    setNotice(
      `QC concluído: ${nextReport.lines.length} linha(s) · score ${nextReport.overallQualityScore.toFixed(0)}/100.`,
    );
  }, [lines, usePython, activeLineId]);

  const runAi = useCallback(async () => {
    if (!report) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/geofisica/qc/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        interpretation?: QcAiResult;
      };
      if (data.ok && data.interpretation) setAi(data.interpretation);
    } catch {
      setAi(ruleBasedQcAi(report));
    } finally {
      setAiLoading(false);
    }
  }, [report]);

  const importProjectSections = useCallback(
    (sections: SavedGeophysSection[], mode = importMode) => {
      if (sections.length === 0) {
        setNotice("Nenhuma secção no projeto.");
        return;
      }
      const qcLines = savedSectionsToQcLines(sections);
      applyQcLines(
        setLines,
        setActiveLineId,
        setReport,
        setAi,
        qcLines,
        mode,
      );
      setSectionsVersion((v) => v + 1);
      setNotice(
        `${sections.length} secção(ões) do projeto importada(s): ${sections.map((s) => s.code).join(", ")}.`,
      );
    },
    [importMode],
  );

  const loadFromProject = useCallback(
    (ids: string[] | "all" = "all") => {
      if (selectedObraId == null) {
        setNotice("Selecione a obra do projeto (selector no topo) antes de carregar secções.");
        return;
      }
      const project = loadGeophysProject(selectedObraId);
      const selected =
        ids === "all"
          ? project.sections
          : project.sections.filter(
              (s) => ids.includes(s.id) || ids.includes(s.code),
            );
      importProjectSections(selected, importMode);
    },
    [importMode, importProjectSections, selectedObraId],
  );

  const loadFromDipolo = useCallback(() => {
    try {
      const raw = localStorage.getItem(DIPOLO_STORAGE);
      if (!raw) {
        setNotice("Nenhum projeto Dipolo-Dipolo guardado.");
        return;
      }
      const j = JSON.parse(raw) as {
        linha?: SolodataLinhaState;
        defaultA?: string;
        surveyLocation?: GeoSurveyLocation;
      };
      if (!j.linha?.rows?.length) {
        setNotice("Projeto Dipolo sem leituras.");
        return;
      }
      const loc = j.surveyLocation ?? GARUVA_DEFAULT_LOCATION;
      const a = Number(j.defaultA) || 15;
      const line = linhaToSurveyLine(j.linha, loc, a);
      applyQcLines(
        setLines,
        setActiveLineId,
        setReport,
        setAi,
        [line],
        importMode,
      );
      setNotice("Dados do Dipolo-Dipolo carregados.");
    } catch {
      setNotice("Erro ao ler dados do Dipolo-Dipolo.");
    }
  }, [importMode]);

  const loadDemo = useCallback(() => {
    const demo = loadSolodataLinha12Demo();
    const line = linhaToSurveyLine(demo, GARUVA_DEFAULT_LOCATION, 15);
    applyQcLines(
      setLines,
      setActiveLineId,
      setReport,
      setAi,
      [line],
      "replace",
    );
    setNotice("Demo Linha 12 carregada.");
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      const lineIndex = lines.filter((l) => l.readings.length > 0).length;

      try {
        if (lower.endsWith(".dat") || lower.endsWith(".txt")) {
          const parsed = parseRes2dinvDatWithTopography(text);
          if (parsed) {
            const linha = res2dinvToSolodataLinha(parsed);
            const readings = solodataLinhaToReadings(
              linha,
              parsed.unitSpacingM ?? 15,
            );
            const reg = registerLineFromRes2dinv(parsed, lineIndex);
            const line = readingsToQcSurveyLine(
              readings,
              parsed.title ?? file.name.replace(/\.[^.]+$/, ""),
              reg.geometry,
              {
                lineLengthM: reg.lineLengthM,
                azimuthDeg: reg.azimuthDeg,
              },
            );
            applyQcLines(
              setLines,
              setActiveLineId,
              setReport,
              setAi,
              [line],
              importMode,
            );
            setNotice(
              `RES2DINV: ${line.readings.length} leituras importadas.`,
            );
            return;
          }
        }

        const bundle = parseDipoloImportFile(text, file.name);
        if (!bundle || bundle.readings.length === 0) {
          setNotice("Formato não reconhecido (CSV/TXT/DAT/RES2DINV).");
          return;
        }
        const reg = registerLineFromReadings(
          bundle.readings,
          bundle.topography,
          lineIndex,
        );
        const line = readingsToQcSurveyLine(
          bundle.readings,
          bundle.title ?? file.name.replace(/\.[^.]+$/, ""),
          reg.geometry,
          { lineLengthM: reg.lineLengthM, azimuthDeg: reg.azimuthDeg },
        );
        applyQcLines(
          setLines,
          setActiveLineId,
          setReport,
          setAi,
          [line],
          importMode,
        );
        setNotice(
          `Importado: ${line.readings.length} leituras · ${reg.lineLengthM.toFixed(0)} m.`,
        );
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Erro ao importar ficheiro.");
      }
    },
    [importMode, lines],
  );

  useEffect(() => {
    const pending = consumePendingQcLoad();
    if (pending) {
      loadFromProject(pending);
    }
  }, [loadFromProject]);

  useEffect(() => {
    if (selectedObraId == null) return;
    const project = loadGeophysProject(selectedObraId);
    if (project.sections.length > 0) return;
    loadDemo();
    // Demo inicial apenas se não houver secções guardadas no projeto desta obra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObraId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/geofisica"
            className="text-sm text-teal-700 hover:underline dark:text-teal-400"
          >
            ← Geofísica
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text)]">
            QC automático — dados geofísicos
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Classificação verde / amarelo / vermelho por SNR, spikes, FFT,
            coerência espacial e ruído 50/60 Hz. Importe ficheiros, secções do
            projeto (GEO01, GEO02…) ou dados do Dipolo-Dipolo.
          </p>
        </div>
        <QcLegend />
      </div>

      {notice && (
        <div className="rounded-lg border border-teal-600/30 bg-teal-50 px-4 py-2 text-sm text-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runAnalysis}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
        >
          Analisar QC
        </button>
        <button
          type="button"
          onClick={() => loadFromProject("all")}
          className="rounded-lg border border-teal-600/40 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-100"
        >
          Carregar do projeto
        </button>
        <button
          type="button"
          onClick={loadFromDipolo}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)]"
        >
          Carregar Dipolo-Dipolo
        </button>
        <label className="cursor-pointer rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)]">
          Importar ficheiro
          <input
            type="file"
            accept=".dat,.csv,.txt,.tsv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={loadDemo}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)]"
        >
          Demo Linha 12
        </button>
        <button
          type="button"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              defaultQcLine(`Linha ${prev.length + 1}`),
            ])
          }
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)]"
        >
          + Linha
        </button>
        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={importMode === "append"}
            onChange={(e) =>
              setImportMode(e.target.checked ? "append" : "replace")
            }
          />
          Acumular linhas ao importar
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={usePython}
            onChange={(e) => setUsePython(e.target.checked)}
          />
          Validar SNR no Python (8092)
        </label>
      </div>

      <GeophysSectionsPanel
        obraId={selectedObraId}
        showVolumeActions={false}
        showQcActions
        onImportToQc={(sections) => importProjectSections(sections, importMode)}
        onNotice={setNotice}
        refreshKey={sectionsVersion}
      />

      {lines.some((l) => l.readings.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          {lines
            .filter((l) => l.readings.length > 0)
            .map((l) => (
              <span
                key={l.id}
                className={`rounded-full border px-2 py-0.5 ${
                  l.id === activeLineIdResolved
                    ? "border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
                    : "border-[var(--border)]"
                }`}
              >
                {l.name} — {l.readings.length} leit.
              </span>
            ))}
        </div>
      )}

      {report && (
        <div className="flex flex-wrap gap-2">
          {report.lines.map((l) => (
            <button
              key={l.lineId}
              type="button"
              onClick={() => setActiveLineId(l.lineId)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                l.lineId === activeLineIdResolved
                  ? "ring-2 ring-teal-500"
                  : ""
              } ${QC_GRADE_COLORS[l.grade].bg}`}
            >
              {l.lineName} — SNR {l.snr.toFixed(1)}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <QcMapPanel
          lines={lines}
          reportLines={report?.lines ?? []}
          activeLineId={activeLineIdResolved}
          onLineSelect={setActiveLineId}
          className="h-[360px] lg:min-h-[420px]"
        />
        <QcPanel
          report={report}
          activeLine={activeMetrics}
          ai={ai}
          aiLoading={aiLoading}
          onRunAi={runAi}
        />
      </div>
    </div>
  );
}

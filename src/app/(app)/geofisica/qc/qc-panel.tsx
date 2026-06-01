"use client";

import type { QcAiResult } from "@/lib/geofisica/ai/qc-interpret-ai";
import type { LineQcMetrics, SurveyQcReport } from "@/lib/geofisica/qc/qc-types";
import { QcGradeBadge } from "./qc-legend";
import { QcNoiseChart } from "./qc-noise-chart";

type Props = {
  report: SurveyQcReport | null;
  activeLine: LineQcMetrics | null;
  ai: QcAiResult | null;
  aiLoading?: boolean;
  onRunAi?: () => void;
};

export function QcPanel({
  report,
  activeLine,
  ai,
  aiLoading,
  onRunAi,
}: Props) {
  if (!report) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
        Importe linhas ou carregue dados do Dipolo-Dipolo e clique em{" "}
        <strong>Analisar QC</strong>.
      </div>
    );
  }

  const line = activeLine ?? report.lines[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Painel QC — campanha
          </h2>
          <QcGradeBadge grade={report.overallGrade} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Metric
            label="Score médio"
            value={`${report.overallQualityScore.toFixed(0)}/100`}
          />
          <Metric label="SNR médio" value={report.overallSnr.toFixed(1)} />
          <Metric
            label="Coerência espacial"
            value={`${(report.spatialCoherence * 100).toFixed(0)}%`}
          />
          <Metric label="Linhas" value={String(report.lines.length)} />
          <Metric
            label="Análise"
            value={new Date(report.analyzedAt).toLocaleString("pt-BR")}
          />
        </dl>
      </div>

      {line && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              {line.lineName}
            </h3>
            <QcGradeBadge grade={line.grade} />
          </div>
          <p className="mb-3 text-xs text-[var(--muted)]">{line.summary}</p>
          {line.scoreComponents.length > 0 && (
            <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Score composto — {line.qualityScore.toFixed(0)}/100
              </p>
              <ul className="space-y-1.5">
                {line.scoreComponents.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-[var(--muted)]">
                      {c.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-teal-600"
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono">{c.score.toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <Metric label="Score" value={`${line.qualityScore.toFixed(0)}/100`} />
            <Metric label="SNR" value={line.snr.toFixed(2)} />
            <Metric label="Spikes" value={String(line.spikeCount)} />
            <Metric
              label="Spike ratio"
              value={`${(line.spikeRatio * 100).toFixed(1)}%`}
            />
            <Metric label="σ amplitude" value={line.amplitudeStd.toFixed(1)} />
            <Metric label="CV estabilidade" value={line.stabilityCv.toFixed(2)} />
            <Metric
              label="Var. abrupta máx."
              value={line.maxAbruptChange.toFixed(3)}
            />
            <Metric
              label="Ruído 50 Hz"
              value={`${(line.powerLine50 * 100).toFixed(0)}%`}
            />
            <Metric
              label="Ruído 60 Hz"
              value={`${(line.powerLine60 * 100).toFixed(0)}%`}
            />
            <Metric
              label="Índice espectral"
              value={line.spectralNoiseIndex.toFixed(2)}
            />
          </dl>
          <div className="mt-4">
            <QcNoiseChart line={line} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Interpretação IA
          </h3>
          {onRunAi && (
            <button
              type="button"
              onClick={onRunAi}
              disabled={aiLoading}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {aiLoading ? "Gerando…" : "Gerar interpretação"}
            </button>
          )}
        </div>
        {ai ? (
          <div className="space-y-3 text-xs text-[var(--text)]">
            <p>{ai.summary}</p>
            <p className="text-[var(--muted)]">{ai.overallReliability}</p>
            <ul className="space-y-2">
              {ai.lineInterpretations.map((li) => (
                <li
                  key={li.lineId}
                  className="rounded-lg border border-[var(--border)] p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium">{li.lineName}</span>
                    <QcGradeBadge grade={li.grade} />
                  </div>
                  <p>{li.noiseOrigin}</p>
                  <p className="mt-1 text-[var(--muted)]">{li.reliability}</p>
                  {li.recommendations.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-[var(--muted)]">
                      {li.recommendations.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            Análise heurística + OpenAI (se configurada) sobre origem do ruído,
            qualidade da linha e confiabilidade da aquisição.
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--bg)] px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd className="font-mono text-sm font-medium">{value}</dd>
    </div>
  );
}

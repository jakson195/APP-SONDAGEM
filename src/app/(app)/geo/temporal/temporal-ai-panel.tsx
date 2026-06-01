"use client";

import type { TemporalAiResult } from "@/lib/geo/temporal/temporal-types";
import type { TemporalInterpretResult } from "@/lib/geo/temporal/ai/temporal-interpret-ai";

type Props = {
  ai: TemporalAiResult | null;
  interpretation: TemporalInterpretResult | null;
  loading?: boolean;
  onRun: () => void;
  targets: string[];
  onToggleTarget: (t: string) => void;
  allTargets: { id: string; label: string }[];
};

export function TemporalAiPanel({
  ai,
  interpretation,
  loading,
  onRun,
  targets,
  onToggleTarget,
  allTargets,
}: Props) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">IA — detecção temporal</h3>
        <button
          type="button"
          disabled={loading}
          onClick={onRun}
          className="rounded bg-violet-700 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {loading ? "A analisar…" : "Executar IA"}
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {allTargets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggleTarget(t.id)}
            className={`rounded px-2 py-0.5 text-[10px] ${
              targets.includes(t.id)
                ? "bg-violet-100 text-violet-900 dark:bg-violet-950/50"
                : "border border-[var(--border)] opacity-60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {ai && (
        <div className="space-y-2 text-xs">
          <p className="text-[var(--muted)]">{ai.summary}</p>
          <p className="text-[10px] text-[var(--muted)]">Motor: {ai.method}</p>
          {ai.detections.map((d) => (
            <div
              key={d.target}
              className="rounded border border-[var(--border)] p-2"
            >
              <div className="flex justify-between font-medium">
                <span>{d.label}</span>
                <span>{(d.confidence * 100).toFixed(0)}%</span>
              </div>
              <p className="mt-1 text-[var(--muted)]">{d.summary}</p>
              <p className="text-[10px]">~{d.areaHa.toFixed(1)} ha</p>
            </div>
          ))}
        </div>
      )}
      {interpretation && (
        <div className="mt-3 border-t border-[var(--border)] pt-3 text-xs">
          <p className="font-medium capitalize">Risco: {interpretation.riskLevel}</p>
          <p className="mt-1 text-[var(--muted)]">{interpretation.narrative}</p>
          <ul className="mt-2 list-inside list-disc text-[var(--muted)]">
            {interpretation.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

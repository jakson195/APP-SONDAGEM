"use client";

import dynamic from "next/dynamic";
import type { TemporalChangeAnalysis } from "@/lib/geo/temporal/temporal-types";
import { SPECTRAL_INDEX_LABELS } from "@/lib/geo/temporal/temporal-types";

const DeckHeatmap = dynamic(
  () => import("./temporal-deck-overlay").then((m) => m.TemporalDeckHeatmap),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse rounded bg-slate-800" /> },
);

type Props = {
  change: TemporalChangeAnalysis | null;
  className?: string;
};

export function TemporalHeatmapView({ change, className = "" }: Props) {
  if (!change) {
    return (
      <div className={`rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--muted)] ${className}`}>
        Execute «Analisar mudança» para gerar heatmap temporal.
      </div>
    );
  }

  return (
    <div className={`space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}>
      <h3 className="text-sm font-semibold">Heatmap temporal — {SPECTRAL_INDEX_LABELS[change.index]}</h3>
      <p className="text-xs text-[var(--muted)]">
        {change.dateA} → {change.dateB} · {change.changePct.toFixed(1)}% alterado · Δ médio{" "}
        {change.meanDelta.toFixed(3)}
      </p>
      <DeckHeatmap change={change} />
      <div className="grid max-h-32 gap-1 overflow-y-auto text-[10px]">
        {change.hotspots.slice(0, 8).map((h, i) => (
          <div key={i} className="flex justify-between border-b border-[var(--border)] py-0.5">
            <span>
              {h.lat.toFixed(5)}, {h.lng.toFixed(5)}
            </span>
            <span>mag {h.magnitude.toFixed(3)} · conf {(h.confidence * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

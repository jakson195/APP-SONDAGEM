"use client";

import type { useTemporalTimeline } from "@/lib/geo/temporal/use-temporal-timeline";

type Timeline = ReturnType<typeof useTemporalTimeline>;

type Props = {
  timeline: Timeline;
};

export function TemporalTimelinePanel({ timeline: t }: Props) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Timeline temporal</h3>
        <div className="flex gap-1">
          <button
            type="button"
            className={`rounded px-2 py-0.5 text-xs ${t.mode === "playback" ? "bg-teal-700 text-white" : "border border-[var(--border)]"}`}
            onClick={() => {
              t.exitCompare();
              t.setMode("playback");
            }}
          >
            Animação
          </button>
          <button
            type="button"
            className={`rounded px-2 py-0.5 text-xs ${t.mode === "compare" ? "bg-teal-700 text-white" : "border border-[var(--border)]"}`}
            onClick={() => t.setMode("compare")}
          >
            Comparar
          </button>
        </div>
      </div>

      {t.mode === "playback" && (
        <>
          <p className="mb-1 text-[9px] text-[var(--muted)]">
            Clique na data para ver no mapa · checkbox inclui na animação
          </p>
          <div className="mb-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {t.epochs.map((d) => (
              <span
                key={d}
                className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] ${
                  t.currentEpoch === d
                    ? "border-teal-500 bg-teal-50 ring-1 ring-teal-500 dark:bg-teal-950/40"
                    : "border-[var(--border)]"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-teal-600"
                  checked={t.selectedDates.has(d)}
                  title="Incluir na animação"
                  onChange={() => t.toggleDate(d)}
                />
                <button
                  type="button"
                  className={`rounded px-1 py-0.5 ${
                    t.selectedDates.has(d)
                      ? "text-teal-900 dark:text-teal-100"
                      : "text-[var(--muted)] opacity-60"
                  }`}
                  onClick={() => t.selectEpoch(d)}
                >
                  {d}
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="text-sm" onClick={t.stepPrev}>
              ⏮
            </button>
            <button
              type="button"
              className="rounded bg-teal-700 px-2 py-0.5 text-xs text-white"
              onClick={() => t.setPlaying((p) => !p)}
            >
              {t.playing ? "⏸" : "▶"}
            </button>
            <button type="button" className="text-sm" onClick={t.stepNext}>
              ⏭
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, t.playbackDates.length - 1)}
              value={t.index}
              className="flex-1"
              onChange={(e) =>
                t.selectEpoch(t.playbackDates[Number(e.target.value)]!)
              }
            />
            <span className="text-xs text-[var(--muted)]">{t.currentEpoch ?? "—"}</span>
            <select
              value={t.speedIdx}
              onChange={(e) => t.setSpeedIdx(Number(e.target.value))}
              className="rounded border border-[var(--border)] text-xs"
            >
              {t.speedOptions.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {t.mode === "compare" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--muted)]">
            Data A (referência)
            <select
              value={t.dateA ?? ""}
              onChange={(e) => t.setDateA(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            >
              {t.epochs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Data B (comparação)
            <select
              value={t.dateB ?? ""}
              onChange={(e) => t.setDateB(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            >
              {t.epochs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2 flex gap-2">
            {(["side_by_side", "swipe", "diff"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`rounded px-2 py-0.5 text-xs capitalize ${
                  t.compareMode === m
                    ? "bg-slate-700 text-white"
                    : "border border-[var(--border)]"
                }`}
                onClick={() => t.setCompareMode(m)}
              >
                {m.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

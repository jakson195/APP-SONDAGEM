"use client";

import { useEffect, useRef } from "react";
import type { Dipolo2DReading } from "@/lib/geofisica/dipolo2d/types";

type Props = {
  readings: Dipolo2DReading[];
  factorDepth: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onToggleExcluded: (index: number, excluded: boolean) => void;
  onEditRho: (index: number, rho: number | null) => void;
};

export function DipoloReadingsTable({
  readings,
  factorDepth,
  selectedIndex,
  onSelect,
  onToggleExcluded,
  onEditRho,
}: Props) {
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (selectedIndex == null) return;
    rowRefs.current.get(selectedIndex)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedIndex]);

  if (readings.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">Sem leituras válidas na planilha.</p>
    );
  }

  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-[var(--border)]">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-[var(--card)]">
          <tr className="text-left text-[var(--muted)]">
            <th className="border-b border-[var(--border)] px-2 py-1">#</th>
            <th className="border-b border-[var(--border)] px-2 py-1">Dist</th>
            <th className="border-b border-[var(--border)] px-2 py-1">a</th>
            <th className="border-b border-[var(--border)] px-2 py-1">n</th>
            <th className="border-b border-[var(--border)] px-2 py-1">Ps.Z</th>
            <th className="border-b border-[var(--border)] px-2 py-1">ρa</th>
            <th className="border-b border-[var(--border)] px-2 py-1">Ruído</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r, i) => {
            const psZ = factorDepth * r.n * r.aM;
            const sel = selectedIndex === i;
            return (
              <tr
                key={`${r.sourceRowIndex ?? i}-${r.stationM}-${r.n}`}
                ref={(el) => {
                  if (el) rowRefs.current.set(i, el);
                  else rowRefs.current.delete(i);
                }}
                className={
                  (r.excluded ? "opacity-50 " : "") +
                  (sel ? "bg-teal-50/80 dark:bg-teal-950/40 " : "hover:bg-[var(--muted)]/5 ")
                }
                onClick={() => onSelect(sel ? null : i)}
              >
                <td className="border-b border-[var(--border)]/50 px-2 py-1 tabular-nums">
                  {i + 1}
                </td>
                <td className="border-b border-[var(--border)]/50 px-2 py-1 tabular-nums">
                  {r.stationM}
                </td>
                <td className="border-b border-[var(--border)]/50 px-2 py-1 tabular-nums">
                  {r.aM}
                </td>
                <td className="border-b border-[var(--border)]/50 px-2 py-1 tabular-nums">
                  {r.n}
                </td>
                <td className="border-b border-[var(--border)]/50 px-2 py-1 tabular-nums">
                  {psZ.toFixed(2)}
                </td>
                <td
                  className="border-b border-[var(--border)]/50 px-1 py-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="number"
                    step="any"
                    className="w-full min-w-[4.5rem] rounded border border-red-400/60 bg-red-50/50 px-1 py-0.5 tabular-nums dark:bg-red-950/30"
                    value={r.rhoApparentOhmM}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(",", "."));
                      onEditRho(i, Number.isFinite(v) && v > 0 ? v : null);
                    }}
                  />
                </td>
                <td
                  className="border-b border-[var(--border)]/50 px-2 py-1 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={r.excluded === true}
                    title="Excluir ponto (ruído)"
                    onChange={(e) => onToggleExcluded(i, e.target.checked)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { QC_GRADE_COLORS, type QcGrade } from "@/lib/geofisica/qc/qc-types";

export function QcLegend({ className = "" }: { className?: string }) {
  const grades: QcGrade[] = ["green", "yellow", "red"];
  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${className}`}
    >
      <p className="mb-2 text-xs font-medium text-[var(--text)]">
        Legenda QC — score composto (0–100)
      </p>
      <ul className="space-y-1.5">
        {grades.map((g) => (
          <li key={g} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: QC_GRADE_COLORS[g].hex }}
            />
            <span className="font-medium">{QC_GRADE_COLORS[g].label}</span>
            <span className="text-[var(--muted)]">
              {g === "green" ? "≥ 70" : g === "yellow" ? "40 – 69" : "< 40"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
        V/I · corrente mínima · SP · desvio vizinhos · repetibilidade · ruído
        estatístico.
      </p>
    </div>
  );
}

export function QcGradeBadge({ grade }: { grade: QcGrade }) {
  const c = QC_GRADE_COLORS[grade];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.bg}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: c.hex }}
      />
      {c.label}
    </span>
  );
}

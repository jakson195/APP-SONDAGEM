"use client";

import { Plus, Trash2 } from "lucide-react";
import { computeNspt } from "@/lib/spt";
import type { SptReading } from "@/lib/types";

export function emptySptRow(): SptReading {
  return {
    depthM: 0,
    n1: 0,
    n2: 0,
    n3: 0,
    soilDescription: "",
  };
}

export { computeNspt } from "@/lib/spt";

type Props = {
  rows: SptReading[];
  onRowsChange: (rows: SptReading[]) => void;
  idPrefix: string;
};

export function SptInputTable({ rows, onRowsChange, idPrefix }: Props) {
  function updateRow(index: number, patch: Partial<SptReading>) {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    onRowsChange([...rows, emptySptRow()]);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return;
    onRowsChange(rows.filter((_, i) => i !== index));
  }

  const cell =
    "min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-black/[0.02] dark:bg-white/[0.03]">
              <th className="whitespace-nowrap px-2 py-2 pl-3 font-semibold text-[var(--text)] sm:px-3">
                Depth (m)
              </th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold text-[var(--text)] sm:px-3">
                N1
              </th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold text-[var(--text)] sm:px-3">
                N2
              </th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold text-[var(--text)] sm:px-3">
                N3
              </th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold text-[var(--text)] sm:px-3">
                NSPT
              </th>
              <th className="min-w-[160px] px-2 py-2 font-semibold text-[var(--text)] sm:px-3">
                Soil description
              </th>
              <th className="w-10 px-1 py-2" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-2 py-2 pl-3 sm:px-3">
                  <input
                    id={`${idPrefix}-depth-${index}`}
                    type="number"
                    step="any"
                    min={0}
                    value={Number.isFinite(row.depthM) ? row.depthM : ""}
                    onChange={(e) =>
                      updateRow(index, {
                        depthM: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`${cell} w-20 max-w-full`}
                    placeholder="—"
                    aria-label={`Row ${index + 1} depth`}
                  />
                </td>
                <td className="px-2 py-2 sm:px-3">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isFinite(row.n1) ? row.n1 : ""}
                    onChange={(e) =>
                      updateRow(index, {
                        n1:
                          e.target.value === ""
                            ? 0
                            : parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={`${cell} w-16 max-w-full`}
                    aria-label={`Row ${index + 1} N1`}
                  />
                </td>
                <td className="px-2 py-2 sm:px-3">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isFinite(row.n2) ? row.n2 : ""}
                    onChange={(e) =>
                      updateRow(index, {
                        n2:
                          e.target.value === ""
                            ? 0
                            : parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={`${cell} w-16 max-w-full`}
                    aria-label={`Row ${index + 1} N2`}
                  />
                </td>
                <td className="px-2 py-2 sm:px-3">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isFinite(row.n3) ? row.n3 : ""}
                    onChange={(e) =>
                      updateRow(index, {
                        n3:
                          e.target.value === ""
                            ? 0
                            : parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={`${cell} w-16 max-w-full`}
                    aria-label={`Row ${index + 1} N3`}
                  />
                </td>
                <td className="px-2 py-2 sm:px-3">
                  <output
                    className={`${cell} inline-flex w-16 max-w-full cursor-default items-center border-[var(--border)] bg-black/[0.03] tabular-nums text-[var(--text)] dark:bg-white/[0.06]`}
                    aria-live="polite"
                    aria-label={`NSPT, N2 plus N3, row ${index + 1}`}
                    title="N2 + N3 (automatic)"
                  >
                    {computeNspt(row.n2, row.n3)}
                  </output>
                </td>
                <td className="px-2 py-2 sm:px-3">
                  <input
                    type="text"
                    value={row.soilDescription}
                    onChange={(e) =>
                      updateRow(index, { soilDescription: e.target.value })
                    }
                    className={`${cell} w-full min-w-[140px]`}
                    placeholder="e.g. silty sand"
                    aria-label={`Row ${index + 1} soil description`}
                  />
                </td>
                <td className="px-1 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={rows.length <= 1}
                    className="rounded p-1.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
                    aria-label={`Remove row ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-muted)]"
      >
        <Plus className="h-4 w-4" />
        Add row
      </button>
      <p className="text-xs text-[var(--muted)]">
        NSPT is calculated automatically as N2 + N3.
      </p>
    </div>
  );
}

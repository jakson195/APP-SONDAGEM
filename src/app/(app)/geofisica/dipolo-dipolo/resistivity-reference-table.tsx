"use client";

import { useCallback } from "react";
import {
  DEFAULT_INTERPRET_CLASSIFICATION_TABLE,
  RESISTIVITY_REFERENCE_TABLE_BR,
  RESISTIVITY_TABLE_SOURCE,
  cloneClassificationTable,
  formatRefRowRange,
  lookupResistivityReference,
  syncRowFaixaTexto,
  type ResistivityRefRow,
} from "@/lib/geofisica/dipolo2d/resistivity-reference-table-br";
import { downloadTextFile } from "@/lib/field-export-kml-gpx";

const GRUPO_LABEL: Record<string, string> = {
  agua: "Águas",
  solo_fino: "Solos finos / orgânicos",
  sedimento: "Sedimentos",
  rocha: "Rochas",
};

type Props = {
  rows: ResistivityRefRow[];
  onChange: (rows: ResistivityRefRow[]) => void;
  highlightRhoOhmM?: number | null;
  onSuggestByLocation?: () => void;
  suggestBusy?: boolean;
};

function newRowId() {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ResistivityReferenceTable({
  rows,
  onChange,
  highlightRhoOhmM,
  onSuggestByLocation,
  suggestBusy = false,
}: Props) {
  const updateRow = useCallback(
    (id: string, patch: Partial<ResistivityRefRow>) => {
      onChange(
        rows.map((r) => {
          if (r.id !== id) return r;
          const next = syncRowFaixaTexto({ ...r, ...patch });
          return next;
        }),
      );
    },
    [rows, onChange],
  );

  const addRow = () => {
    onChange([
      ...rows,
      syncRowFaixaTexto({
        id: newRowId(),
        meio: "Novo meio",
        faixaTexto: "100 – 500",
        rhoMinOhmM: 100,
        rhoMaxOhmM: 500,
        grupo: "sedimento",
        cor: "#cbd5e1",
      }),
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((r) => r.id !== id));
  };

  const exportTxt = () => {
    const lines = [
      "# Tabela de classificação — meio físico × resistividade (Ω·m)",
      "meio_fisico\trho_min\trho_max\tcor",
      ...rows.map(
        (r) =>
          `${r.meio}\t${r.rhoMinOhmM ?? ""}\t${r.rhoMaxOhmM ?? ""}\t${r.cor}`,
      ),
    ];
    downloadTextFile(
      "classificacao-resistividade.txt",
      lines.join("\n"),
      "text/plain;charset=utf-8",
    );
  };

  const suggested =
    highlightRhoOhmM != null && highlightRhoOhmM > 0
      ? lookupResistivityReference(highlightRhoOhmM, rows)
      : null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Classificação por meio físico e resistividade (Ω·m){" "}
            <span className="rounded bg-teal-600/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-200">
              editável
            </span>
          </h3>
          <p className="mt-0.5 max-w-prose text-xs text-[var(--muted)]">
            Edite as faixas abaixo — a secção interpretativa é gerada com estes
            dados. {RESISTIVITY_TABLE_SOURCE}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]/10"
            onClick={() =>
              onChange(cloneClassificationTable(DEFAULT_INTERPRET_CLASSIFICATION_TABLE))
            }
          >
            3 classes ERT
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]/10"
            onClick={() =>
              onChange(cloneClassificationTable(RESISTIVITY_REFERENCE_TABLE_BR))
            }
          >
            Tabela completa
          </button>
          <button
            type="button"
            disabled={!onSuggestByLocation || suggestBusy}
            className="rounded border border-teal-600/40 bg-teal-600/10 px-2 py-1 text-xs text-teal-800 hover:bg-teal-600/20 disabled:opacity-50 dark:text-teal-200"
            onClick={() => onSuggestByLocation?.()}
          >
            {suggestBusy ? "A sugerir (IA)..." : "Sugestão IA (local)"}
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]/10"
            onClick={addRow}
          >
            + Linha
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]/10"
            onClick={exportTxt}
          >
            Exportar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]/5 text-[var(--muted)]">
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2 font-medium">Meio físico</th>
              <th className="px-2 py-2 font-medium">ρ mín (Ω·m)</th>
              <th className="px-2 py-2 font-medium">ρ máx (Ω·m)</th>
              <th className="px-2 py-2 font-medium">Cor</th>
              <th className="hidden px-2 py-2 font-medium sm:table-cell">Grupo</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const inRange = suggested?.id === row.id;
              return (
                <tr
                  key={row.id}
                  className={
                    inRange
                      ? "bg-teal-500/10 ring-1 ring-inset ring-teal-500/40"
                      : "border-b border-[var(--border)]/60"
                  }
                >
                  <td className="px-2 py-1.5">
                    <span
                      className="inline-block h-4 w-4 rounded border border-black/20"
                      style={{ background: row.cor }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.meio}
                      onChange={(e) => updateRow(row.id, { meio: e.target.value })}
                      className="w-full min-w-[120px] rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--text)]"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.rhoMinOhmM ?? ""}
                      onChange={(e) =>
                        updateRow(row.id, {
                          rhoMinOhmM:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      className="w-24 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.rhoMaxOhmM ?? ""}
                      onChange={(e) =>
                        updateRow(row.id, {
                          rhoMaxOhmM:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      className="w-24 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="color"
                      value={row.cor}
                      onChange={(e) => updateRow(row.id, { cor: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-[var(--border)]"
                    />
                  </td>
                  <td className="hidden px-2 py-1.5 text-[var(--muted)] sm:table-cell">
                    {GRUPO_LABEL[row.grupo] ?? row.grupo}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      title="Remover linha"
                      className="text-[var(--muted)] hover:text-red-600"
                      onClick={() => removeRow(row.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
        <p>
          Faixa exibida:{" "}
          <span className="font-mono text-[var(--text)]">
            {rows.map((r) => `${r.meio} (${formatRefRowRange(r)})`).join(" · ")}
          </span>
        </p>
        {highlightRhoOhmM != null && highlightRhoOhmM > 0 && (
          <p className="mt-1">
            ρ mediana do modelo ≈{" "}
            <strong className="font-mono text-[var(--text)]">
              {highlightRhoOhmM.toFixed(0)} Ω·m
            </strong>
            {suggested ? (
              <>
                {" "}
                → classe na tabela:{" "}
                <strong className="text-[var(--text)]">{suggested.meio}</strong>
              </>
            ) : (
              " (fora das faixas definidas — ajuste os limites)"
            )}
          </p>
        )}
      </div>
    </div>
  );
}

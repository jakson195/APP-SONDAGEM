"use client";

import { useCallback } from "react";
import type { SolodataLinhaRow, SolodataLinhaState } from "@/lib/geofisica/dipolo2d/solodata-linha-types";
import { parseSolodataLinhaPaste } from "@/lib/geofisica/dipolo2d/parse-solodata-linha-paste";

const clEntrada =
  "w-full min-w-[3.5rem] rounded border border-red-500/80 bg-red-50 px-1 py-0.5 text-xs tabular-nums text-red-950 " +
  "placeholder:text-red-400/60 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-400/50 " +
  "dark:border-red-500 dark:bg-red-950/45 dark:text-red-50";

const clCalc =
  "w-full min-w-[3.5rem] rounded border border-[var(--border)] bg-slate-100 px-1 py-0.5 text-xs tabular-nums text-[var(--muted)] " +
  "dark:bg-slate-900/80";

type ColDef = {
  key: keyof SolodataLinhaRow;
  label: string;
  entrada: boolean;
};

const COLS: ColDef[] = [
  { key: "medida", label: "MEDIDA", entrada: false },
  { key: "piquete", label: "PIQUETE", entrada: false },
  { key: "espM", label: "ESP (m)", entrada: false },
  { key: "a", label: "A", entrada: false },
  { key: "b", label: "B", entrada: false },
  { key: "m", label: "M", entrada: false },
  { key: "nEl", label: "N", entrada: false },
  { key: "nivel", label: "NÍVEL", entrada: false },
  { key: "spMv", label: "SP (mV)", entrada: true },
  { key: "vMv", label: "V (mV)", entrada: true },
  { key: "iMa", label: "i (mA)", entrada: true },
  { key: "g", label: "G", entrada: false },
  { key: "k", label: "K", entrada: false },
  { key: "rapCalc", label: "R ap", entrada: false },
  { key: "a2", label: "A", entrada: false },
  { key: "b2", label: "B", entrada: false },
  { key: "m2", label: "M", entrada: false },
  { key: "n2", label: "N", entrada: false },
  { key: "dist", label: "Dist", entrada: true },
  { key: "esp", label: "Esp", entrada: true },
  { key: "nSep", label: "N", entrada: true },
  { key: "rap", label: "R ap", entrada: true },
];

function cellVal(n: number | null): string | number {
  return n != null && Number.isFinite(n) ? n : "";
}

function parseCell(raw: string): number | null {
  const clean = raw.replace(",", ".").trim();
  if (!clean) return null;
  const v = Number(clean);
  return Number.isFinite(v) ? v : null;
}

type Props = {
  state: SolodataLinhaState;
  onChange: (next: SolodataLinhaState) => void;
  defaultAM: number;
};

export function SolodataLinhaSheet({ state, onChange, defaultAM }: Props) {
  const { meta, rows } = state;

  const setMeta = (patch: Partial<SolodataLinhaState["meta"]>) => {
    onChange({ ...state, meta: { ...meta, ...patch } });
  };

  const setRow = (idx: number, patch: Partial<SolodataLinhaRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...state, rows: next });
  };

  const addRow = () => {
    const med = rows.length > 0 ? (rows[rows.length - 1]!.medida ?? 0) + 1 : 1;
    onChange({
      ...state,
      rows: [
        ...rows,
        {
          medida: med,
          piquete: 1,
          espM: 15,
          a: null,
          b: null,
          m: null,
          nEl: null,
          nivel: null,
          spMv: null,
          vMv: null,
          iMa: null,
          g: null,
          k: null,
          rapCalc: null,
          a2: null,
          b2: null,
          m2: null,
          n2: null,
          dist: null,
          esp: 15,
          nSep: null,
          rap: null,
        },
      ],
    });
  };

  const onPasteTable = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text");
      if (!text.includes("\t")) return;
      e.preventDefault();
      const { rows: parsed } = parseSolodataLinhaPaste(text, defaultAM);
      if (parsed.length > 0) {
        onChange({ ...state, rows: parsed });
      }
    },
    [state, onChange, defaultAM],
  );

  return (
    <div className="space-y-3" onPaste={onPasteTable}>
      <p className="text-xs text-[var(--muted)]">
        Layout igual à folha <strong>PLANILHA SOLODATA</strong> (ex. LINHA 12): células{" "}
        <span className="rounded border border-red-400/80 bg-red-50 px-1 dark:bg-red-950/40">
          vermelhas
        </span>{" "}
        = dados que introduz (SP, V, i e Dist / Esp / N / R ap). Cole a folha inteira
        do Excel com Ctrl+V na tabela.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-[var(--muted)]">
          Título
          <input
            type="text"
            className="mt-1 block w-48 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm dark:bg-gray-900"
            value={meta.titulo}
            onChange={(e) => setMeta({ titulo: e.target.value })}
          />
        </label>
        <label className="block text-xs text-[var(--muted)]">
          Linha n.º
          <input
            type="text"
            className="mt-1 block w-20 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm dark:bg-gray-900"
            value={meta.linha}
            onChange={(e) => setMeta({ linha: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]/10"
          onClick={addRow}
        >
          + linha
        </button>
      </div>

      <div className="max-h-[min(70vh,640px)] max-w-full overflow-auto rounded-lg border border-[var(--border)]">
        <table className="min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--card)]">
            <tr>
              <th
                colSpan={14}
                className="border border-[var(--border)] px-2 py-1 text-left font-medium text-[var(--muted)]"
              >
                Campo / cálculo
              </th>
              <th
                colSpan={4}
                className="border border-[var(--border)] px-2 py-1 text-left font-medium text-[var(--muted)]"
              >
                Eléctrodos (perfil)
              </th>
              <th
                colSpan={4}
                className="border border-[var(--border)] bg-red-50/50 px-2 py-1 text-left font-medium text-red-900 dark:bg-red-950/30 dark:text-red-200"
              >
                Perfil 2D — entrada (vermelho)
              </th>
            </tr>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={
                    "whitespace-nowrap border border-[var(--border)] px-1 py-1 font-medium " +
                    (c.entrada
                      ? "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100"
                      : "text-[var(--muted)]")
                  }
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-[var(--muted)]/5">
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className="border border-[var(--border)]/60 p-0 align-middle"
                  >
                    <input
                      type="number"
                      step="any"
                      readOnly={!c.entrada}
                      className={c.entrada ? clEntrada : clCalc}
                      value={cellVal(row[c.key])}
                      onChange={
                        c.entrada
                          ? (e) =>
                              setRow(idx, {
                                [c.key]: parseCell(e.target.value),
                              } as Partial<SolodataLinhaRow>)
                          : undefined
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
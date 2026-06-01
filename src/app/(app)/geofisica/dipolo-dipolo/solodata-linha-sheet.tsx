"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SolodataLinhaRow, SolodataLinhaState } from "@/lib/geofisica/dipolo2d/solodata-linha-types";
import { parseSolodataLinhaPaste } from "@/lib/geofisica/dipolo2d/parse-solodata-linha-paste";
import {
  applyElectrodeToRows,
  applyGridToSolodataRows,
  applySpViToRows,
  emptySolodataRow,
  isMultiCellPaste,
  looksLikeElectrodeBlock,
  parseClipboardGrid,
  parseElectrodeBlock,
  parseNumCell,
  parseSpViBlock,
} from "@/lib/geofisica/dipolo2d/solodata-grid-paste";
import {
  lineQcFromSheet,
  qcGradesByRowIndex,
} from "@/lib/geofisica/qc/qc-row-grades";
import { computeSolodataLinhaRow } from "@/lib/geofisica/dipolo2d/solodata-linha-compute";
import type { QcGrade } from "@/lib/geofisica/qc/qc-types";
import { QC_GRADE_COLORS } from "@/lib/geofisica/qc/qc-types";

const clEntrada =
  "w-full min-w-0 rounded border border-red-500/80 bg-red-50 px-0.5 py-0 text-[11px] tabular-nums text-red-950 " +
  "placeholder:text-red-400/60 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-400/50 " +
  "dark:border-red-500 dark:bg-red-950/45 dark:text-red-50";

/** SP, V, i — digitados em campo; coluna mais larga e confortável. */
const clEntradaCampo =
  "w-full min-w-[4.5rem] rounded border border-red-500/80 bg-red-50 px-1.5 py-0.5 text-xs tabular-nums text-red-950 " +
  "placeholder:text-red-400/60 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-400/50 " +
  "dark:border-red-500 dark:bg-red-950/45 dark:text-red-50";

const clCalc =
  "w-full min-w-0 rounded border border-[var(--border)] bg-slate-100 px-0.5 py-0 text-[11px] tabular-nums text-[var(--muted)] " +
  "dark:bg-slate-900/80";

type ColDef = {
  key: keyof SolodataLinhaRow;
  label: string;
  entrada: boolean;
  /** Largura fixa da coluna */
  w: string;
  /** Entrada digitada em campo (SP, V, i) — coluna mais larga */
  campo?: boolean;
  /** Sem limite max-w — G, K, Rap */
  wide?: boolean;
};

const COLS: ColDef[] = [
  { key: "medida", label: "MED.", entrada: false, w: "w-10" },
  { key: "piquete", label: "PIQ.", entrada: false, w: "w-10" },
  { key: "espM", label: "ESP", entrada: false, w: "w-11" },
  { key: "a", label: "A", entrada: true, w: "w-10" },
  { key: "b", label: "B", entrada: true, w: "w-10" },
  { key: "m", label: "M", entrada: true, w: "w-10" },
  { key: "nEl", label: "N", entrada: true, w: "w-10" },
  { key: "nivel", label: "NIV.", entrada: true, w: "w-10" },
  { key: "spMv", label: "SP (mV)", entrada: true, w: "w-[5.75rem]", campo: true },
  { key: "vMv", label: "V (mV)", entrada: true, w: "w-[5.75rem]", campo: true },
  { key: "iMa", label: "i (mA)", entrada: true, w: "w-[5.25rem]", campo: true },
  { key: "g", label: "G", entrada: false, w: "w-10", wide: true },
  { key: "k", label: "K", entrada: false, w: "w-10", wide: true },
  { key: "rapCalc", label: "Rap", entrada: false, w: "w-14", wide: true },
  { key: "a2", label: "A", entrada: false, w: "w-8" },
  { key: "b2", label: "B", entrada: false, w: "w-8" },
  { key: "m2", label: "M", entrada: false, w: "w-11" },
  { key: "n2", label: "N", entrada: false, w: "w-11" },
  { key: "dist", label: "Dist", entrada: true, w: "w-12" },
  { key: "esp", label: "Esp", entrada: true, w: "w-11" },
  { key: "nSep", label: "N", entrada: true, w: "w-10" },
  { key: "rap", label: "Rap", entrada: true, w: "w-14", wide: true },
  { key: "cota", label: "Cota", entrada: true, w: "w-12" },
];

const COL_KEYS = COLS.map((c) => c.key);

function cellVal(n: number | null | undefined): string | number {
  return n != null && Number.isFinite(n) ? n : "";
}

function numericCell(row: SolodataLinhaRow, key: ColDef["key"]): number | null | undefined {
  const v = row[key];
  return typeof v === "number" || v === null ? v : undefined;
}

function cellEditKey(rowIdx: number, colKey: ColDef["key"]): string {
  return `${rowIdx}:${colKey}`;
}

function formatStoredCell(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? String(n) : "";
}

/** Permite digitar «-», vírgula/ponto e decimais incompletos antes de gravar. */
function isAllowedNumericDraft(raw: string): boolean {
  const t = raw.trim();
  if (t === "") return true;
  return /^-?\d*[,.]?\d*$/.test(t);
}

function QcDot({
  grade,
  tooltip,
  isSpike,
}: {
  grade: QcGrade;
  tooltip: string;
  isSpike?: boolean;
}) {
  const c = QC_GRADE_COLORS[grade];
  return (
    <span
      title={tooltip}
      className="inline-flex items-center justify-center"
      aria-label={tooltip}
    >
      <span
        className={`inline-block rounded-full ${isSpike ? "h-3.5 w-3.5 ring-2 ring-red-400" : "h-3 w-3"}`}
        style={{ backgroundColor: c.hex }}
      />
    </span>
  );
}

type Props = {
  state: SolodataLinhaState;
  onChange: Dispatch<SetStateAction<SolodataLinhaState>>;
  defaultAM: number;
};

export function SolodataLinhaSheet({ state, onChange, defaultAM }: Props) {
  const { meta, rows } = state;
  const [pasteInfo, setPasteInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const lastFocusRef = useRef({ row: 0, col: 0 });

  const rowsComputed = useMemo(
    () => rows.map((row) => computeSolodataLinhaRow(row, defaultAM)),
    [rows, defaultAM],
  );

  const computedState = useMemo(
    () => ({ ...state, rows: rowsComputed }),
    [state, rowsComputed],
  );

  const rowQc = useMemo(
    () => qcGradesByRowIndex(computedState, defaultAM),
    [computedState, defaultAM],
  );
  const lineQc = useMemo(
    () => lineQcFromSheet(computedState, defaultAM),
    [computedState, defaultAM],
  );

  const setMeta = (patch: Partial<SolodataLinhaState["meta"]>) => {
    onChange({ ...state, meta: { ...meta, ...patch } });
  };

  const setRow = (idx: number, patch: Partial<SolodataLinhaRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...state, rows: next });
  };

  const commitCellEdit = useCallback(
    (rowIdx: number, col: ColDef, raw: string) => {
      const ek = cellEditKey(rowIdx, col.key);
      setEditing((prev) => {
        if (!(ek in prev)) return prev;
        const next = { ...prev };
        delete next[ek];
        return next;
      });
      const parsed = parseNumCell(raw);
      onChange((prev) => ({
        ...prev,
        rows: prev.rows.map((r, i) =>
          i === rowIdx ? { ...r, [col.key]: parsed } : r,
        ),
      }));
    },
    [onChange],
  );

  const displayCellValue = (
    rowIdx: number,
    row: SolodataLinhaRow,
    col: ColDef,
  ): string => {
    const ek = cellEditKey(rowIdx, col.key);
    if (col.entrada && ek in editing) return editing[ek]!;
    return formatStoredCell(numericCell(row, col.key));
  };

  const addRow = () => {
    const med = rows.length > 0 ? (rows[rows.length - 1]!.medida ?? 0) + 1 : 1;
    onChange({
      ...state,
      rows: [...rows, emptySolodataRow(med, defaultAM > 0 ? defaultAM : 15)],
    });
  };

  const applyPasteText = useCallback(
    (text: string, startRow = 0, startCol = 0): boolean => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const espDef = defaultAM > 0 ? defaultAM : 15;
      const finish = (info: string) => {
        setEditing({});
        setPasteInfo(info);
        return true;
      };

      if (isMultiCellPaste(trimmed)) {
        const grid = parseClipboardGrid(trimmed);
        const colCount = grid[0]?.length ?? 0;

        const applyPositionalGrid = () => {
          onChange((prev) => ({
            ...prev,
            rows: applyGridToSolodataRows(
              prev.rows,
              grid,
              startRow,
              startCol,
              COL_KEYS,
              espDef,
            ),
          }));
          return finish(
            `${grid.length} linha(s) × ${colCount} coluna(s) colada(s)`,
          );
        };

        const applyElectrodePaste = (rowsBlock: ReturnType<typeof parseElectrodeBlock>["rows"]) => {
          onChange((prev) => ({
            ...prev,
            rows: applyElectrodeToRows(prev.rows, rowsBlock, startRow, espDef),
          }));
          return finish(`A / B / M / N / NIV. — ${rowsBlock.length} linha(s) colada(s)`);
        };

        // Colagem ancorada numa célula (ex.: colar A..NIV começando na coluna A)
        if (startCol > 0 || startRow > 0) {
          if (colCount === 5 && startCol === 3) {
            const { rows: el } = parseElectrodeBlock(trimmed);
            if (el.length > 0) return applyElectrodePaste(el);
          }
          if (grid.length > 0 && colCount >= 1) return applyPositionalGrid();
        }

        // Bloco 5 colunas A B M N NIV (sem MED./PIQ./ESP.)
        if (colCount === 5) {
          const { rows: el } = parseElectrodeBlock(trimmed);
          if (el.length > 0 && looksLikeElectrodeBlock(el)) {
            return applyElectrodePaste(el);
          }
        }

        const { rows: parsed } = parseSolodataLinhaPaste(trimmed, defaultAM);
        if (parsed.length > 0) {
          const electrodeOnlyRows = parsed.every(
            (r) =>
              r.medida == null &&
              r.dist == null &&
              (r.a != null ||
                r.b != null ||
                r.m != null ||
                r.nEl != null ||
                r.nivel != null),
          );
          if (electrodeOnlyRows) {
            onChange((prev) => {
              const base = prev.rows.map((r) => ({ ...r }));
              parsed.forEach((p, i) => {
                const idx = startRow + i;
                while (idx >= base.length) {
                  const med =
                    base.length > 0
                      ? (base[base.length - 1]!.medida ?? base.length) + 1
                      : 1;
                  base.push(emptySolodataRow(med, espDef));
                }
                base[idx] = { ...base[idx]!, ...p };
              });
              return { ...prev, rows: base };
            });
            return finish(`A / B / M / N / NIV. — ${parsed.length} linha(s) colada(s)`);
          }

          const spViOnly = parsed.every(
            (r) =>
              r.medida == null &&
              r.dist == null &&
              (r.spMv != null || r.vMv != null || r.iMa != null),
          );
          if (spViOnly) {
            onChange((prev) => ({
              ...prev,
              rows: applySpViToRows(
                prev.rows,
                parsed.map((r) => ({
                  spMv: r.spMv,
                  vMv: r.vMv,
                  iMa: r.iMa,
                })),
                startRow,
                espDef,
              ),
            }));
            return finish(`SP / V / i — ${parsed.length} linha(s) colada(s)`);
          }

          if (parsed[0]!.medida != null) {
            const profileOnly = parsed.every(
              (r) => r.spMv == null && r.vMv == null && r.iMa == null,
            );
            const electrodeOnly = parsed.every(
              (r) =>
                r.a != null ||
                r.b != null ||
                r.m != null ||
                r.nEl != null ||
                r.nivel != null,
            );
            onChange((prev) => {
              if (profileOnly || electrodeOnly) {
                const base = prev.rows.map((r) => ({ ...r }));
                parsed.forEach((p, i) => {
                  const idx = startRow + i;
                  while (idx >= base.length) {
                    const med =
                      base.length > 0
                        ? (base[base.length - 1]!.medida ?? base.length) + 1
                        : 1;
                    base.push(emptySolodataRow(med, espDef));
                  }
                  base[idx] = { ...base[idx]!, ...p };
                });
                return { ...prev, rows: base };
              }
              return { ...prev, rows: parsed };
            });
            return finish(
              electrodeOnly && !profileOnly
                ? `${parsed.length} linha(s) — eléctrodos A/B/M/N/NIV.`
                : `${parsed.length} linha(s) colada(s) do Excel`,
            );
          }
        }

        // Bloco SP / V / i (exactamente 3 colunas)
        if (colCount === 3) {
          const { rows: spvi } = parseSpViBlock(trimmed);
          if (spvi.length > 0) {
            onChange((prev) => ({
              ...prev,
              rows: applySpViToRows(prev.rows, spvi, startRow, espDef),
            }));
            return finish(`SP / V / i — ${spvi.length} linha(s) colada(s)`);
          }
        }

        if (grid.length === 0) {
          setPasteInfo(
            "Formato não reconhecido. Copie do Excel com Ctrl+C e cole com Ctrl+V.",
          );
          return false;
        }

        return applyPositionalGrid();
      }

      const key = COL_KEYS[startCol];
      if (!key || key === "excluded") return false;
      const val = parseNumCell(trimmed);
      if (val == null) return false;
      onChange((prev) => ({
        ...prev,
        rows: prev.rows.map((r, i) =>
          i === startRow ? { ...r, [key]: val } : r,
        ),
      }));
      return finish("1 valor colado");
    },
    [onChange, defaultAM],
  );

  const handleCellPaste = useCallback(
    (e: React.ClipboardEvent, rowIdx: number, colIdx: number) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text.trim()) return;
      e.preventDefault();
      e.stopPropagation();
      const ok = applyPasteText(text, rowIdx, colIdx);
      if (!ok) {
        setPasteInfo(
          "Não foi possível colar. Clique na célula A (ou SP) e use Ctrl+V.",
        );
      }
    },
    [applyPasteText],
  );

  const pasteFromClipboard = useCallback(async () => {
    const anchor = lastFocusRef.current;
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        applyPasteText(text, anchor.row, anchor.col);
        return;
      }
    } catch {
      /* fallback textarea */
    }
    pasteAreaRef.current?.focus();
    pasteAreaRef.current?.select();
  }, [applyPasteText]);

  const onPasteTable = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text.trim()) return;
      if (!isMultiCellPaste(text)) return;
      e.preventDefault();
      const anchor = lastFocusRef.current;
      applyPasteText(text, anchor.row, anchor.col);
    },
    [applyPasteText],
  );

  const onPasteArea = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData("text/plain");
      e.preventDefault();
      const anchor = lastFocusRef.current;
      if (applyPasteText(text, anchor.row, anchor.col)) {
        e.currentTarget.value = "";
      }
    },
    [applyPasteText],
  );

  return (
    <div className="space-y-3" onPaste={onPasteTable}>
      <p className="text-xs text-[var(--muted)]">
        Layout igual à folha <strong>PLANILHA SOLODATA</strong> (ex. LINHA 12): células{" "}
        <span className="rounded border border-red-400/80 bg-red-50 px-1 dark:bg-red-950/40">
          vermelhas
        </span>{" "}
        = dados que introduz (A, B, M, N, NIV., SP, V, i e Dist / Esp / N / R ap).{" "}
        Colunas <strong>G, K, Rap</strong> e posições em metros (A/B/M/N do perfil) são{" "}
        <strong>calculadas automaticamente</strong> (fórmulas Excel SOLODATA:{" "}
        G=1/((1/H)−2/(H+1)+1/(H+2)), K=2π·G·ESP, Rap=|((V−SP)/i)·K|).{" "}
        <strong>Ctrl+V</strong> na célula <strong>A</strong> (ou na primeira coluna
        do bloco) — cola blocos do Excel (A/B/M/N/NIV., SP/V/i, folha completa ou
        qualquer região). Use vírgula ou ponto decimal.
      </p>

      {pasteInfo && (
        <p className="rounded-lg border border-teal-600/30 bg-teal-50 px-3 py-1.5 text-xs text-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
          {pasteInfo}
        </p>
      )}

      {lineQc && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>Qualidade da linha:</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${QC_GRADE_COLORS[lineQc.grade].bg}`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: QC_GRADE_COLORS[lineQc.grade].hex }}
            />
            {QC_GRADE_COLORS[lineQc.grade].label} — score{" "}
            {lineQc.qualityScore.toFixed(0)}/100
          </span>
        </p>
      )}

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
        <button
          type="button"
          className="rounded-lg border border-teal-600/50 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-100"
          onClick={() => void pasteFromClipboard()}
        >
          Colar do Excel
        </button>
        <textarea
          ref={pasteAreaRef}
          rows={1}
          placeholder="Ou cole aqui (Ctrl+V)…"
          className="min-w-[10rem] flex-1 rounded border border-dashed border-[var(--border)] px-2 py-1 text-xs"
          onPaste={onPasteArea}
        />
      </div>

      <div className="max-h-[min(70vh,640px)] max-w-full overflow-auto rounded-lg border border-[var(--border)]">
        <table className="w-max border-collapse text-[11px] table-fixed">
          <thead className="sticky top-0 z-10 bg-[var(--card)]">
            <tr>
              <th
                colSpan={14}
                className="border border-[var(--border)] px-1.5 py-0.5 text-left text-[10px] font-medium text-[var(--muted)]"
              >
                Campo / cálculo
              </th>
              <th
                colSpan={4}
                className="border border-[var(--border)] px-1.5 py-0.5 text-left text-[10px] font-medium text-[var(--muted)]"
              >
                Eléctrodos (perfil)
              </th>
              <th
                colSpan={5}
                className="border border-[var(--border)] bg-red-50/50 px-1.5 py-0.5 text-left text-[10px] font-medium text-red-900 dark:bg-red-950/30 dark:text-red-200"
              >
                Perfil 2D — entrada (vermelho)
              </th>
              <th
                rowSpan={2}
                className="w-10 border border-[var(--border)] bg-slate-100 px-1 py-0.5 text-center text-[10px] font-medium text-[var(--muted)] dark:bg-slate-900/60"
              >
                QC
              </th>
            </tr>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={
                    `${c.w} ${c.campo || c.wide ? "" : "max-w-[3rem]"} whitespace-nowrap border border-[var(--border)] px-0.5 py-0.5 text-center text-[10px] font-medium ` +
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
            {rowsComputed.map((row, idx) => (
              <tr key={idx} className="hover:bg-[var(--muted)]/5">
                {COLS.map((c, colIdx) => (
                  <td
                    key={c.key}
                    className={`${c.w} ${c.campo || c.wide ? "" : "max-w-[3rem]"} border border-[var(--border)]/60 p-0 align-middle`}
                    onPasteCapture={(e) => handleCellPaste(e, idx, colIdx)}
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      step="any"
                      readOnly={!c.entrada}
                      className={
                        c.campo ? clEntradaCampo : c.entrada ? clEntrada : clCalc
                      }
                      value={
                        c.entrada
                          ? displayCellValue(idx, row, c)
                          : String(cellVal(numericCell(row, c.key)))
                      }
                      onPaste={(e) => handleCellPaste(e, idx, colIdx)}
                      onFocus={
                        c.entrada
                          ? () => {
                              lastFocusRef.current = { row: idx, col: colIdx };
                              const ek = cellEditKey(idx, c.key);
                              setEditing((prev) => {
                                if (ek in prev) return prev;
                                return {
                                  ...prev,
                                  [ek]: formatStoredCell(
                                    numericCell(rows[idx] ?? row, c.key),
                                  ),
                                };
                              });
                            }
                          : () => {
                              lastFocusRef.current = { row: idx, col: colIdx };
                            }
                      }
                      onChange={
                        c.entrada
                          ? (e) => {
                              const text = e.target.value;
                              if (!isAllowedNumericDraft(text)) return;
                              setEditing((prev) => ({
                                ...prev,
                                [cellEditKey(idx, c.key)]: text,
                              }));
                            }
                          : undefined
                      }
                      onBlur={
                        c.entrada
                          ? (e) => commitCellEdit(idx, c, e.target.value)
                          : undefined
                      }
                      onKeyDown={
                        c.entrada
                          ? (e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                ))}
                <td className="w-10 border border-[var(--border)]/60 px-0 py-0 text-center align-middle">
                  {(() => {
                    const qc = rowQc.get(idx);
                    if (!qc) {
                      return (
                        <span
                          className="text-[10px] text-[var(--muted)]"
                          title="Sem R ap válido para QC"
                        >
                          —
                        </span>
                      );
                    }
                    return (
                      <QcDot
                        grade={qc.grade}
                        tooltip={qc.tooltip}
                        isSpike={qc.isSpike}
                      />
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
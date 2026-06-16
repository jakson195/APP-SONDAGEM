"use client";

import { useCallback, useState } from "react";
import {
  buildDemoTopography,
  parseTopographyDelimited,
  parseTopographyPaste,
  topographyStationsFromDistances,
} from "@/lib/geofisica/dipolo2d/parse-topography";
import type { TopographyPoint } from "@/lib/geofisica/dipolo2d/topography-types";
import type { Dipolo2DReading } from "@/lib/geofisica/dipolo2d/types";

type Props = {
  topography: TopographyPoint[];
  onChange: (points: TopographyPoint[]) => void;
  showTopography: boolean;
  onShowTopographyChange: (v: boolean) => void;
  readings: Dipolo2DReading[];
  /** Ocultar checkbox «Mostrar no modelo» (ex.: painel Volume 3D). */
  hideShowToggle?: boolean;
};

function parseCell(raw: string): number | null {
  const v = Number(raw.replace(",", ".").trim());
  return Number.isFinite(v) ? v : null;
}

export function DipoloTopographyPanel({
  topography,
  onChange,
  showTopography,
  onShowTopographyChange,
  readings,
  hideShowToggle = false,
}: Props) {
  const [pasteText, setPasteText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const setPoint = (index: number, patch: Partial<TopographyPoint>) => {
    onChange(
      topography.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  };

  const addPoint = () => {
    const last = topography[topography.length - 1];
    onChange([
      ...topography,
      {
        stationM: last ? last.stationM + 15 : 0,
        elevationM: last?.elevationM ?? 0,
      },
    ]);
  };

  const removePoint = (index: number) => {
    onChange(topography.filter((_, i) => i !== index));
  };

  const importFile = useCallback(async (file: File) => {
    const text = await file.text();
    const pts = parseTopographyDelimited(text);
    if (pts.length < 2) {
      setNotice("Ficheiro: precisa de ≥2 pontos (distância, cota).");
      return;
    }
    onChange(pts);
    setNotice(`Importados ${pts.length} pontos de «${file.name}».`);
  }, [onChange]);

  const applyPaste = () => {
    const pts = parseTopographyPaste(pasteText);
    if (pts.length < 2) {
      setNotice("Colar: use duas colunas (distância m, cota m), ≥2 linhas.");
      return;
    }
    onChange(pts);
    setPasteText("");
    setNotice(`Colados ${pts.length} pontos.`);
  };

  const fromStations = () => {
    const stations = readings
      .filter((r) => !r.excluded)
      .map((r) => r.stationM);
    if (stations.length < 2) {
      setNotice("Precisa de ≥2 leituras ativas com Dist definido.");
      return;
    }
    const pts = topographyStationsFromDistances(stations);
    onChange(pts);
    setNotice(
      `Criadas ${pts.length} estações (cota 0 — preencha as cotas manualmente).`,
    );
  };

  const loadExample = () => {
    const stations = readings
      .filter((r) => !r.excluded)
      .map((r) => r.stationM);
    if (stations.length < 2) {
      setNotice("Precisa de ≥2 leituras ativas para gerar topografia de exemplo.");
      return;
    }
    const pts = buildDemoTopography(stations);
    onChange(pts);
    onShowTopographyChange(true);
    setNotice(`Topografia de exemplo: ${pts.length} pontos (cotas simuladas).`);
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Topografia do perfil
          </h3>
          <p className="text-xs text-[var(--muted)]">
            Cotas ao longo da linha (m). Exibida no topo do modelo invertido.
          </p>
        </div>
        {!hideShowToggle && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showTopography}
            onChange={(e) => onShowTopographyChange(e.target.checked)}
          />
          Mostrar no modelo
        </label>
        )}
      </div>

      {notice && (
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-100">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadExample}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
        >
          Topografia de exemplo
        </button>
        <button
          type="button"
          onClick={fromStations}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]/10"
        >
          Criar estações (cotas vazias)
        </button>
        <button
          type="button"
          onClick={addPoint}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]/10"
        >
          + Ponto
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
        >
          Limpar
        </button>
        <label className="cursor-pointer rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-900 dark:text-teal-200">
          Importar CSV/TSV
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const input = e.currentTarget;
              const f = input.files?.[0];
              if (!f) return;
              void importFile(f).finally(() => {
                input.value = "";
              });
            }}
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <textarea
          className="min-h-[4rem] w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 font-mono text-xs dark:bg-gray-900"
          placeholder={"Colar: distância (m) + cota (m)\n13.0\t125.4\n46.2\t118.2"}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <button
          type="button"
          onClick={applyPaste}
          className="h-fit rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700"
        >
          Aplicar colagem
        </button>
      </div>

      {topography.length > 0 ? (
        <div className="max-h-48 overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[16rem] text-left text-xs">
            <thead className="sticky top-0 bg-[var(--card)]">
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="px-2 py-1.5">Dist (m)</th>
                <th className="px-2 py-1.5">Cota (m)</th>
                <th className="px-2 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {topography.map((p, i) => (
                <tr key={i} className="border-b border-[var(--border)]/60">
                  <td className="px-1 py-0.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full rounded border border-[var(--border)] px-1 py-0.5 font-mono"
                      value={p.stationM}
                      onChange={(e) => {
                        const v = parseCell(e.target.value);
                        if (v != null) setPoint(i, { stationM: v });
                      }}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full rounded border border-[var(--border)] px-1 py-0.5 font-mono"
                      value={p.elevationM}
                      onChange={(e) => {
                        const v = parseCell(e.target.value);
                        if (v != null) setPoint(i, { elevationM: v });
                      }}
                    />
                  </td>
                  <td className="px-1 py-0.5 text-center">
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => removePoint(i)}
                      aria-label="Remover"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Sem topografia. Importe um ficheiro, cole distância+cota ou crie estações
          a partir das leituras e preencha as cotas.
        </p>
      )}
    </div>
  );
}

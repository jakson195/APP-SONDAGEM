"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawModelSection } from "@/lib/geofisica/dipolo2d/dipolo-pseudo-draw";
import { invertDipolo2DPhysics } from "@/lib/geofisica/dipolo2d/physics-invert-2d";
import { resolvePhysicsInvertMethod } from "@/lib/geofisica/dipolo2d/invert-method-resolve";
import type { ResistivityColorScale } from "@/lib/geofisica/dipolo2d/colormap";
import {
  DIPOLO2D_INVERT_METHODS,
  type Dipolo2DInvertMethodId,
  type Dipolo2DInvertParams,
  type Dipolo2DInvertResult,
  type Dipolo2DReading,
} from "@/lib/geofisica/dipolo2d/types";

export type InvertMethodCompareRow = {
  id: Dipolo2DInvertMethodId;
  label: string;
  short: string;
  result: Dipolo2DInvertResult | null;
};

type ModelMaskMode = "full" | "coverage";

function MethodThumb({
  row,
  params,
  colorScale,
  maskMode,
  activeReadings,
  selected,
  onSelect,
}: {
  row: InvertMethodCompareRow;
  params: Dipolo2DInvertParams;
  colorScale: ResistivityColorScale;
  maskMode: ModelMaskMode;
  activeReadings: Dipolo2DReading[];
  selected: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const r = row.result;
    if (!canvas || !r) return;
    drawModelSection(
      canvas,
      r.mLog10,
      r.nx,
      r.nz,
      r.xEdgesM,
      r.zEdgesM,
      colorScale,
      {
        readings: activeReadings,
        factorDepth: params.factorDepth,
        iterations: r.iterations,
        rmsLog10: r.rmsLog10,
        rmsPercent: r.rmsPercent,
        maskMode,
        colorLevels: 18,
        displaySmoothPasses: 0,
        logContrast: "log_percentile",
        invertEngine: "physics",
      },
    );
  }, [row.result, params, colorScale, maskMode, activeReadings, row.id]);

  const r = row.result;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col overflow-hidden rounded-lg border text-left transition-shadow ${
        selected
          ? "border-teal-600 ring-2 ring-teal-600/40"
          : "border-[var(--border)] hover:border-teal-600/50"
      }`}
    >
      <div className="border-b border-[var(--border)] bg-[var(--muted)]/5 px-2 py-1.5">
        <span className="text-xs font-semibold text-[var(--text)]">
          {row.short}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">
          {row.label}
        </span>
      </div>
      {r ? (
        <>
          <canvas
            ref={canvasRef}
            className="aspect-[5/3] w-full bg-white dark:bg-gray-950"
          />
          <dl className="grid grid-cols-3 gap-1 border-t border-[var(--border)] px-2 py-1.5 text-[10px]">
            <div>
              <dt className="text-[var(--muted)]">RMS</dt>
              <dd className="font-mono font-medium">{r.rmsLog10.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Rug.</dt>
              <dd className="font-mono">{r.roughnessL2.toFixed(3)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Iter.</dt>
              <dd className="font-mono">{r.iterations}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="px-2 py-6 text-center text-xs text-[var(--muted)]">
          Sem resultado
        </p>
      )}
    </button>
  );
}

export function DipoloInvertCompare({
  activeReadings,
  params,
  colorScale,
  maskMode,
  selectedMethod,
  onSelectMethod,
}: {
  activeReadings: Dipolo2DReading[];
  params: Dipolo2DInvertParams;
  colorScale: ResistivityColorScale;
  maskMode: ModelMaskMode;
  selectedMethod: Dipolo2DInvertMethodId;
  onSelectMethod: (id: Dipolo2DInvertMethodId) => void;
}) {
  const [results, setResults] = useState<
    Partial<Record<Dipolo2DInvertMethodId, Dipolo2DInvertResult | null>>
  >({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (activeReadings.length < 4) {
      setResults({});
      setBusy(false);
      return;
    }

    let cancelled = false;
    setBusy(true);

    void (async () => {
      const next: Partial<
        Record<Dipolo2DInvertMethodId, Dipolo2DInvertResult | null>
      > = {};

      await Promise.all(
        DIPOLO2D_INVERT_METHODS.map(async (m) => {
          try {
            const physicsMethod = resolvePhysicsInvertMethod(m.id);
            const result = await invertDipolo2DPhysics(
              activeReadings,
              params,
              physicsMethod,
              undefined,
              undefined,
              "fdm",
              { physicsBackend: "resipy" },
            );
            if (!cancelled) next[m.id] = result;
          } catch {
            if (!cancelled) next[m.id] = null;
          }
        }),
      );

      if (!cancelled) {
        setResults(next);
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeReadings, params]);

  const rows = useMemo((): InvertMethodCompareRow[] => {
    return DIPOLO2D_INVERT_METHODS.map((m) => {
      const result = activeReadings.length < 4 ? null : (results[m.id] ?? null);
      return {
        id: m.id,
        label: result?.methodLabel ?? m.label,
        short: m.short,
        result,
      };
    });
  }, [activeReadings.length, results]);

  const ranked = useMemo(() => {
    return rows
      .filter((r): r is InvertMethodCompareRow & { result: Dipolo2DInvertResult } =>
        r.result != null,
      )
      .slice()
      .sort((a, b) => a.result.rmsLog10 - b.result.rmsLog10);
  }, [rows]);

  const bestRms = ranked[0]?.result.rmsLog10;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-teal-600/30 bg-teal-600/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text)]">
          Comparar métodos no mesmo perfil
        </p>
        <p className="text-xs text-[var(--muted)]">
          {busy
            ? "A calcular inversões RES2DINV (ResIPy R2)…"
            : "Clique num painel ou no rádio — o modelo principal atualiza na hora."}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {rows.map((row) => (
          <MethodThumb
            key={row.id}
            row={row}
            params={params}
            colorScale={colorScale}
            maskMode={maskMode}
            activeReadings={activeReadings}
            selected={selectedMethod === row.id}
            onSelect={() => onSelectMethod(row.id)}
          />
        ))}
      </div>

      {ranked.length > 0 && bestRms != null && (
        <p className="text-xs text-[var(--muted)]">
          Melhor RMS log₁₀:{" "}
          <span className="font-mono font-medium text-teal-700 dark:text-teal-300">
            {bestRms.toFixed(4)}
          </span>{" "}
          ({ranked[0].short})
        </p>
      )}
    </div>
  );
}

"use client";

import {
  defaultColorScale,
  type ResistivityColorScale,
} from "@/lib/geofisica/dipolo2d/colormap";
import { exportInvertModelPng } from "@/lib/geofisica/dipolo2d/model-section-export";
import type { ModelDrawOptions } from "@/lib/geofisica/dipolo2d/dipolo-pseudo-draw";
import type { TopographyPoint } from "@/lib/geofisica/dipolo2d/topography-types";
import type { Dipolo2DInvertResult, Dipolo2DReading } from "@/lib/geofisica/dipolo2d/types";
import { ColorScalePanel } from "./color-scale-panel";

type Props = {
  invertResult: Dipolo2DInvertResult;
  activeReadings: Dipolo2DReading[];
  factorDepth: number;
  maskMode: "full" | "coverage";
  colorScale: ResistivityColorScale;
  onColorScaleChange: (next: ResistivityColorScale) => void;
  scaleXM: number;
  scaleZM: number;
  onScaleXMChange: (v: number) => void;
  onScaleZMChange: (v: number) => void;
  suggestedRhoMin?: number;
  suggestedRhoMax?: number;
  topography?: TopographyPoint[];
  showTopography?: boolean;
};

export function DipoloModelExportPanel({
  invertResult,
  activeReadings,
  factorDepth,
  maskMode,
  colorScale,
  onColorScaleChange,
  scaleXM,
  scaleZM,
  onScaleXMChange,
  onScaleZMChange,
  suggestedRhoMin,
  suggestedRhoMax,
  topography = [],
  showTopography = true,
}: Props) {
  const buildDrawOpts = (): ModelDrawOptions => ({
    readings: activeReadings,
    factorDepth,
    maskMode,
    iterations: invertResult.iterations,
    rmsLog10: invertResult.rmsLog10,
    methodLabel: invertResult.methodLabel,
    scaleXM,
    scaleZM,
    topography,
    showTopography: showTopography && topography.length >= 2,
    colorLevels: 24,
    displaySmoothPasses: 2,
  });

  const exportPng = (widthPx: number) => {
    exportInvertModelPng(invertResult, colorScale, buildDrawOpts(), widthPx);
  };

  return (
    <div className="grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-3 lg:grid-cols-[minmax(200px,240px)_1fr]">
      <ColorScalePanel
        title="Escala de cor (modelo invertido)"
        scale={colorScale}
        onChange={onColorScaleChange}
        suggestedMin={suggestedRhoMin}
        suggestedMax={suggestedRhoMax}
      />
      <div className="space-y-3">
        <p className="text-sm font-medium text-[var(--text)]">
          Escala do perfil e exportação
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-[var(--muted)]">
            Escala horizontal
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={scaleXM}
                onChange={(e) => onScaleXMChange(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min={0.25}
                max={4}
                step={0.05}
                className="w-16 rounded border border-[var(--border)] bg-white px-1.5 py-1 font-mono text-sm dark:bg-gray-900"
                value={scaleXM}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) onScaleXMChange(Math.max(0.25, Math.min(4, v)));
                }}
              />
            </div>
            <span className="mt-0.5 block text-[10px]">
              1 = natural · &gt;1 exagera distância (ajusta na largura da tela)
            </span>
          </label>
          <label className="block text-xs text-[var(--muted)]">
            Escala vertical (profundidade)
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={scaleZM}
                onChange={(e) => onScaleZMChange(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min={0.25}
                max={4}
                step={0.05}
                className="w-16 rounded border border-[var(--border)] bg-white px-1.5 py-1 font-mono text-sm dark:bg-gray-900"
                value={scaleZM}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) onScaleZMChange(Math.max(0.25, Math.min(4, v)));
                }}
              />
            </div>
            <span className="mt-0.5 block text-[10px]">1 = natural · &gt;1 exagera profundidade</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportPng(1400)}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Exportar PNG (1400 px)
          </button>
          <button
            type="button"
            onClick={() => exportPng(2000)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]/10"
          >
            PNG alta resolução (2000 px)
          </button>
          <button
            type="button"
            onClick={() => {
              onScaleXMChange(1);
              onScaleZMChange(1);
              onColorScaleChange({ ...defaultColorScale });
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--muted)]/10"
          >
            Repor escalas e cor
          </button>
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          A exportação inclui legenda, barra de cores e anotações do método. Use escala
          automática (P8–P92) ou defina ρ mín/máx e paleta acima.
        </p>
      </div>
    </div>
  );
}

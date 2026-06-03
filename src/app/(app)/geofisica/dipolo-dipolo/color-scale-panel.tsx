"use client";

import {
  defaultColorScale,
  type ResistivityColorScale,
  type ResistivityPalette,
} from "@/lib/geofisica/dipolo2d/colormap";
import type { ModelDisplayScale } from "@/lib/geofisica/dipolo2d/model-visual-scale";

type Props = {
  scale: ResistivityColorScale;
  onChange: (next: ResistivityColorScale) => void;
  suggestedMin?: number;
  suggestedMax?: number;
  title?: string;
  displayScale?: ModelDisplayScale;
  onDisplayScaleChange?: (s: ModelDisplayScale) => void;
};

const PALETTES: { id: ResistivityPalette; label: string }[] = [
  { id: "x2ipi", label: "x2ipi" },
  { id: "jet", label: "Jet" },
  { id: "rainbow", label: "Arco-íris" },
  { id: "default", label: "Padrão" },
  { id: "grayscale", label: "Cinzento" },
];

export function ColorScalePanel({
  scale,
  onChange,
  suggestedMin,
  suggestedMax,
  title = "Escala de cor (ρa)",
  displayScale = "log",
  onDisplayScaleChange,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
      <p className="font-medium text-[var(--text)]">{title}</p>

      {onDisplayScaleChange && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-[var(--muted)]">Escala de visualização</legend>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="radio"
                name="display-scale"
                checked={displayScale === "log"}
                onChange={() => onDisplayScaleChange("log")}
              />
              Log₁₀(ρ) — RES2DINV
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="radio"
                name="display-scale"
                checked={displayScale === "linear"}
                onChange={() => onDisplayScaleChange("linear")}
              />
              Linear (Ω·m)
            </label>
          </div>
        </fieldset>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={scale.auto}
          onChange={(e) => onChange({ ...scale, auto: e.target.checked })}
        />
        <span className="text-[var(--muted)]">
          Automática (P5–P95 do modelo / dados)
        </span>
      </label>
      {!scale.auto && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-[var(--muted)]">
            ρ mín (Ω·m)
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
              value={scale.rhoMinOhmM ?? ""}
              placeholder={suggestedMin != null ? String(Math.round(suggestedMin)) : ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                onChange({
                  ...scale,
                  rhoMinOhmM: Number.isFinite(v) && v > 0 ? v : null,
                });
              }}
            />
          </label>
          <label className="block text-xs text-[var(--muted)]">
            ρ máx (Ω·m)
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1 dark:bg-gray-900"
              value={scale.rhoMaxOhmM ?? ""}
              placeholder={suggestedMax != null ? String(Math.round(suggestedMax)) : ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                onChange({
                  ...scale,
                  rhoMaxOhmM: Number.isFinite(v) && v > 0 ? v : null,
                });
              }}
            />
          </label>
        </div>
      )}
      <label className="block text-xs text-[var(--muted)]">
        Paleta
        <select
          className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 dark:bg-gray-900"
          value={scale.palette}
          onChange={(e) =>
            onChange({
              ...scale,
              palette: e.target.value as ResistivityPalette,
            })
          }
        >
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="text-xs text-teal-700 underline dark:text-teal-400"
        onClick={() => onChange({ ...defaultColorScale })}
      >
        Repor escala padrão
      </button>
    </div>
  );
}

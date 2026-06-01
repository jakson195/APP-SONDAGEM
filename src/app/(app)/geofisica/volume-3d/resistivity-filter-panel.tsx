"use client";

import {
  DEFAULT_RHO_FILTER,
  RHO_FILTER_PRESETS,
  type VolumeRhoFilter,
} from "@/lib/geofisica/volume3d/volume-rho-filter";
import {
  formatVolumeM3,
  type RhoBandVolumeStats,
} from "@/lib/geofisica/3d-engine/block-model";

type Props = {
  filter: VolumeRhoFilter;
  onChange: (filter: VolumeRhoFilter) => void;
  volumeRhoMin?: number;
  volumeRhoMax?: number;
  bandStats?: RhoBandVolumeStats | null;
};

export function ResistivityFilterPanel({
  filter,
  onChange,
  volumeRhoMin,
  volumeRhoMax,
  bandStats,
}: Props) {
  const absMin = Math.max(1, volumeRhoMin ?? 1);
  const absMax = Math.max(absMin + 1, volumeRhoMax ?? 10_000);

  return (
    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text)]">
          Filtro por resistividade
        </p>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={filter.enabled}
            onChange={(e) =>
              onChange({ ...filter, enabled: e.target.checked })
            }
            className="rounded"
          />
          Activo
        </label>
      </div>

      <p className="text-[10px] text-[var(--muted)]">
        Voxels fora da faixa ficam transparentes; dentro da faixa são
        coloridos pela paleta.
      </p>

      <div className="flex flex-wrap gap-1">
        {RHO_FILTER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              onChange({
                enabled: true,
                rhoMinOhmM: p.min,
                rhoMaxOhmM: p.max,
              })
            }
            className={`rounded border px-2 py-0.5 text-[10px] ${
              filter.enabled &&
              filter.rhoMinOhmM === p.min &&
              filter.rhoMaxOhmM === p.max
                ? "border-amber-600 bg-amber-100 dark:bg-amber-900/40"
                : "border-[var(--border)] hover:bg-[var(--bg)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="block text-xs text-[var(--muted)]">
        ρ mínima: {filter.rhoMinOhmM.toFixed(0)} Ω·m
        <input
          type="range"
          min={absMin}
          max={absMax}
          step={Math.max(1, (absMax - absMin) / 200)}
          value={Math.min(filter.rhoMinOhmM, filter.rhoMaxOhmM - 1)}
          disabled={!filter.enabled}
          onChange={(e) =>
            onChange({
              ...filter,
              rhoMinOhmM: Math.min(
                Number(e.target.value),
                filter.rhoMaxOhmM - 1,
              ),
            })
          }
          className="w-full disabled:opacity-40"
        />
      </label>

      <label className="block text-xs text-[var(--muted)]">
        ρ máxima: {filter.rhoMaxOhmM.toFixed(0)} Ω·m
        <input
          type="range"
          min={absMin}
          max={absMax}
          step={Math.max(1, (absMax - absMin) / 200)}
          value={Math.max(filter.rhoMaxOhmM, filter.rhoMinOhmM + 1)}
          disabled={!filter.enabled}
          onChange={(e) =>
            onChange({
              ...filter,
              rhoMaxOhmM: Math.max(
                Number(e.target.value),
                filter.rhoMinOhmM + 1,
              ),
            })
          }
          className="w-full disabled:opacity-40"
        />
      </label>

      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_RHO_FILTER, enabled: false })}
        className="text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        Repor faixa completa
      </button>

      {bandStats && bandStats.validCellCount > 0 && (
        <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs">
          <p className="font-medium text-[var(--text)]">Volume do corpo</p>
          {filter.enabled ? (
            <>
              <p className="mt-1 font-mono text-base font-semibold text-amber-900 dark:text-amber-200">
                {formatVolumeM3(bandStats.volumeM3)}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-[var(--muted)]">
                <div>
                  <dt>Faixa ρ</dt>
                  <dd className="font-mono text-[var(--text)]">
                    {filter.rhoMinOhmM.toFixed(0)}–{filter.rhoMaxOhmM.toFixed(0)}{" "}
                    Ω·m
                  </dd>
                </div>
                <div>
                  <dt>ρ média</dt>
                  <dd className="font-mono text-[var(--text)]">
                    {bandStats.meanRhoOhmM.toFixed(0)} Ω·m
                  </dd>
                </div>
                <div>
                  <dt>Blocos</dt>
                  <dd className="font-mono text-[var(--text)]">
                    {bandStats.cellCount.toLocaleString("pt-BR")} /{" "}
                    {bandStats.validCellCount.toLocaleString("pt-BR")}
                  </dd>
                </div>
                <div>
                  <dt>Do volume válido</dt>
                  <dd className="font-mono text-[var(--text)]">
                    {bandStats.fractionPercent.toFixed(1)}%
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className="mt-1 font-mono text-sm text-[var(--text)]">
                {formatVolumeM3(bandStats.volumeTotalM3)} (total)
              </p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                Active o filtro para calcular o volume de uma faixa ρ.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

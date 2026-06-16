"use client";

import {
  DEFAULT_RESIPY_WORKFLOW,
  RESIPY_WORKFLOW_STEPS,
  type ResipyWorkflowStepId,
} from "@/lib/geofisica/dipolo2d/resipy-workflow";
import type { Dipolo2DInvertParams } from "@/lib/geofisica/dipolo2d/types";

type Props = {
  params: Dipolo2DInvertParams;
  onChange: (next: Dipolo2DInvertParams) => void;
  activeStep?: ResipyWorkflowStepId;
  onStepChange?: (step: ResipyWorkflowStepId) => void;
  onGoPseudo?: () => void;
};

function num(
  v: string,
  fallback: number,
): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function ResipyWorkflowPanel({
  params,
  onChange,
  activeStep = "invert",
  onStepChange,
  onGoPseudo,
}: Props) {
  const set = (patch: Partial<Dipolo2DInvertParams>) =>
    onChange({ ...params, ...patch });

  const rhoMin = params.rhoMinOhmM ?? DEFAULT_RESIPY_WORKFLOW.rhoMinOhmM;
  const rhoMax = params.rhoMaxOhmM ?? DEFAULT_RESIPY_WORKFLOW.rhoMaxOhmM;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Workflow ResIPy: edite ρa na pseudoseção → ajuste malha →
        parâmetros de inversão → visualização.
      </p>

      <div className="flex flex-wrap gap-1">
        {RESIPY_WORKFLOW_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onStepChange?.(s.id);
              if (s.id === "pseudo") onGoPseudo?.();
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              activeStep === s.id
                ? "bg-teal-700 text-white"
                : "border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
            }`}
          >
            {s.short}
          </button>
        ))}
      </div>

      {(activeStep === "pseudo" || activeStep === "invert") && (
        <fieldset className="rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-medium">Filtros de dados</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={params.filterReciprocal !== false}
                onChange={(e) => set({ filterReciprocal: e.target.checked })}
              />
              Erro recíproco (ResIPy)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={params.filterNegative !== false}
                onChange={(e) => set({ filterNegative: e.target.checked })}
              />
              Remover ρa negativos
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={params.filterDuplicates !== false}
                onChange={(e) => set({ filterDuplicates: e.target.checked })}
              />
              Remover duplicados
            </label>
            <label className="text-xs text-[var(--muted)]">
              Erro % máx.
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0}
                max={100}
                step={1}
                value={params.filterPctError ?? 15}
                onChange={(e) =>
                  set({ filterPctError: num(e.target.value, 15) })
                }
              />
            </label>
          </div>
          {activeStep === "pseudo" && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Edite ρa na tabela ou duplo-clique na pseudoseção (aba
              Pseudoseção).
            </p>
          )}
        </fieldset>
      )}

      {activeStep === "mesh" && (
        <fieldset className="rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-medium">Malha (ResIPy R2)</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--muted)]">
              Tipo
              <select
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                value={params.meshType ?? "trian"}
                onChange={(e) =>
                  set({
                    meshType: e.target.value as "trian" | "quad",
                  })
                }
              >
                <option value="trian">Triangular (R2)</option>
                <option value="quad">Quadrilateral</option>
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              CL factor
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0.5}
                max={8}
                step={0.1}
                value={params.meshClFactor ?? 2}
                onChange={(e) =>
                  set({ meshClFactor: num(e.target.value, 2) })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Refine
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0}
                max={4}
                step={1}
                value={params.meshRefine ?? 0}
                onChange={(e) =>
                  set({ meshRefine: num(e.target.value, 0) })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              FMD (m) — vazio = auto
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0}
                step={0.5}
                placeholder="auto"
                value={params.meshFmdM ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  set({
                    meshFmdM: raw === "" ? null : num(raw, 0),
                  });
                }}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Células X (grelha exibição)
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={12}
                max={36}
                value={params.nx}
                onChange={(e) => set({ nx: num(e.target.value, 22) })}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Células Z
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={8}
                max={20}
                value={params.nz}
                onChange={(e) => set({ nz: num(e.target.value, 12) })}
              />
            </label>
          </div>
        </fieldset>
      )}

      {activeStep === "invert" && (
        <fieldset className="rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-medium">
            Parâmetros de inversão
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--muted)]">
              ρ mín (Ω·m)
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0.01}
                step={0.1}
                value={rhoMin}
                onChange={(e) =>
                  set({ rhoMinOhmM: num(e.target.value, rhoMin) })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              ρ máx (Ω·m)
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={1}
                step={10}
                value={rhoMax}
                onChange={(e) =>
                  set({ rhoMaxOhmM: num(e.target.value, rhoMax) })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Tolerância
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0.001}
                max={0.5}
                step={0.005}
                value={params.tolerance ?? 0.02}
                onChange={(e) =>
                  set({ tolerance: num(e.target.value, 0.02) })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Máx. iterações
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={1}
                max={40}
                value={params.maxIter}
                onChange={(e) =>
                  set({ maxIter: num(e.target.value, params.maxIter) })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              λ_reg
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0}
                step={0.001}
                value={params.lambda}
                onChange={(e) =>
                  set({ lambda: num(e.target.value, params.lambda) })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              a_wgt (erro)
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0}
                max={1}
                step={0.01}
                value={params.aWgt ?? 0.03}
                onChange={(e) => set({ aWgt: num(e.target.value, 0.03) })}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              b_wgt
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0}
                max={1}
                step={0.01}
                value={params.bWgt ?? 0}
                onChange={(e) => set({ bWgt: num(e.target.value, 0) })}
              />
            </label>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input
                type="checkbox"
                checked={params.doiEstimate === true}
                onChange={(e) => set({ doiEstimate: e.target.checked })}
              />
              Estimar DOI (Depth of Investigation — ResIPy)
            </label>
          </div>
        </fieldset>
      )}

      {activeStep === "display" && (
        <fieldset className="rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-medium">
            Visualização pós-inversão
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-[var(--muted)]">
              Contour smooth (passes)
              <input
                type="number"
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                min={0}
                max={6}
                value={params.contourSmoothPasses ?? 1}
                onChange={(e) =>
                  set({
                    contourSmoothPasses: num(e.target.value, 1),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={params.cropCorners !== false}
                onChange={(e) => set({ cropCorners: e.target.checked })}
              />
              Crop corners (máscara sensibilidade)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={params.sensitivityOverlay !== false}
                onChange={(e) =>
                  set({ sensitivityOverlay: e.target.checked })
                }
              />
              Overlay sensibilidade
            </label>
          </div>
        </fieldset>
      )}
    </div>
  );
}

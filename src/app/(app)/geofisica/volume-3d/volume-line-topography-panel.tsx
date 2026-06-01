"use client";

import { DipoloTopographyPanel } from "../dipolo-dipolo/dipolo-topography-panel";
import type { TopographyPoint } from "@/lib/geofisica/dipolo2d/topography-types";
import type { GeophysSurveyLine } from "@/lib/geofisica/volume3d/volume3d-types";

type Props = {
  line: GeophysSurveyLine | null;
  onTopographyChange: (lineId: string, topography: TopographyPoint[]) => void;
  onReapplyTerrain: () => void;
  terrainBusy?: boolean;
  volumeReady: boolean;
};

export function VolumeLineTopographyPanel({
  line,
  onTopographyChange,
  onReapplyTerrain,
  terrainBusy,
  volumeReady,
}: Props) {
  if (!line) {
    return (
      <p className="text-xs text-[var(--muted)]">
        Seleccione uma linha no mapa ou na lista para importar topografia.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text)]">
          Topografia — {line.name}
        </p>
        {volumeReady && (
          <button
            type="button"
            disabled={terrainBusy || (line.topography?.length ?? 0) < 2}
            onClick={onReapplyTerrain}
            className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {terrainBusy ? "A aplicar…" : "Aplicar ao volume 3D"}
          </button>
        )}
      </div>
      <p className="text-[10px] text-[var(--muted)]">
        Importe distância + cota (CSV/TSV) ou use DEM. Os perfis 2D e blocos
        passam a acompanhar o terreno.
      </p>
      <DipoloTopographyPanel
        topography={line.topography ?? []}
        onChange={(topo) => onTopographyChange(line.id, topo)}
        showTopography
        onShowTopographyChange={() => {}}
        readings={line.readings}
        hideShowToggle
      />
    </div>
  );
}

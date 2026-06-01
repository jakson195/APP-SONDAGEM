"use client";

import dynamic from "next/dynamic";
import type { TemporalChangeAnalysis } from "@/lib/geo/temporal/temporal-types";

const Scene = dynamic(
  () => import("./temporal-voxel-scene").then((m) => m.TemporalVoxelScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center rounded-lg bg-slate-950 text-xs text-slate-400">
        A carregar voxel temporal 3D…
      </div>
    ),
  },
);

type Props = {
  change: TemporalChangeAnalysis | null;
};

export function TemporalVoxelPanel({ change }: Props) {
  if (!change) {
    return (
      <div className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--muted)]">
        Voxel temporal 3D — disponível após análise de mudança.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <h3 className="mb-2 text-sm font-semibold">Voxel temporal 3D (Three.js)</h3>
      <Scene change={change} />
    </div>
  );
}

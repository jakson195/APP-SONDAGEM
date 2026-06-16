import { computeNspt } from "@/lib/spt";
import type { SptReading } from "@/lib/types";

export type SoilLayer = {
  fromM: number;
  toM: number;
  description: string;
  nspt?: number;
};

/** Builds interpreted layers from sample depths (each interval ends at the listed sample depth). */
export function buildSoilProfile(
  readings: SptReading[],
  boreholeDepthM: number,
): SoilLayer[] {
  const sorted = [...readings]
    .filter((r) => r.depthM > 0)
    .sort((a, b) => a.depthM - b.depthM);

  if (sorted.length === 0) return [];

  const layers: SoilLayer[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const fromM = i === 0 ? 0 : sorted[i - 1].depthM;
    const toM = sorted[i].depthM;
    if (toM <= fromM) continue;
    layers.push({
      fromM,
      toM,
      description: sorted[i].soilDescription.trim() || "Not described",
      nspt: computeNspt(sorted[i].n2, sorted[i].n3),
    });
  }

  const maxSampleDepth = sorted[sorted.length - 1].depthM;
  const bottom = Math.max(boreholeDepthM, maxSampleDepth);
  if (bottom > maxSampleDepth + 1e-6) {
    layers.push({
      fromM: maxSampleDepth,
      toM: bottom,
      description: "Below last sample / not logged",
    });
  }

  return layers;
}

export function profileDiagramSpanM(
  layers: SoilLayer[],
  boreholeDepthM: number,
): number {
  const fromLayers =
    layers.length > 0 ? Math.max(...layers.map((l) => l.toM)) : 0;
  return Math.max(boreholeDepthM, fromLayers, 0.1);
}

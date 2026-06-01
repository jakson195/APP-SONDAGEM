"use client";

import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { TemporalChangeAnalysis } from "@/lib/geo/temporal/temporal-types";

type Props = {
  change: TemporalChangeAnalysis;
};

export function TemporalDeckHeatmap({ change }: Props) {
  const { nx, ny, values, bounds } = change.heatmapGrid;
  const data = useMemo(() => {
    const pts: { position: [number, number]; weight: number }[] = [];
    const dLng = (bounds.east - bounds.west) / nx;
    const dLat = (bounds.north - bounds.south) / ny;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const w = values[i + j * nx] ?? 0;
        if (w <= 0.01) continue;
        pts.push({
          position: [bounds.west + (i + 0.5) * dLng, bounds.south + (j + 0.5) * dLat],
          weight: w,
        });
      }
    }
    return pts;
  }, [change]);

  const initialViewState = {
    longitude: (bounds.west + bounds.east) / 2,
    latitude: (bounds.south + bounds.north) / 2,
    zoom: 12,
    pitch: 0,
    bearing: 0,
  };

  const layers = [
    new HeatmapLayer({
      id: "temporal-change-heatmap",
      data,
      getPosition: (d) => d.position,
      getWeight: (d) => d.weight,
      radiusPixels: 40,
      intensity: 1.2,
      threshold: 0.08,
    }),
  ];

  return (
    <div className="relative h-[220px] overflow-hidden rounded-lg border border-slate-700">
      <DeckGL
        initialViewState={initialViewState}
        controller
        layers={layers}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

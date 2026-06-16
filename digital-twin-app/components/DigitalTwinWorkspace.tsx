"use client";

import { useCallback, useMemo, useState } from "react";

import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { GeoTiffUpload } from "@/components/GeoTiffUpload";
import { MapboxMap } from "@/components/MapboxMap";
import { riskColor, riskLabel } from "@/lib/risk";
import type { ChangePointsGeoJSON, CompareResult, OrthoPreview } from "@/lib/types";

export function DigitalTwinWorkspace() {
  const [orthoLayers, setOrthoLayers] = useState<OrthoPreview[]>([]);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUploaded = useCallback((preview: OrthoPreview) => {
    setOrthoLayers((current) => {
      const rest = current.filter((item) => item.slot !== preview.slot);
      return [...rest, preview].sort((a, b) => a.slot.localeCompare(b.slot));
    });
  }, []);

  const handleCompareComplete = useCallback((result: CompareResult) => {
    const heatmapUrl = result.heatmapUrl.startsWith("http")
      ? result.heatmapUrl
      : `${window.location.origin}${result.heatmapUrl}`;
    setCompareResult({ ...result, heatmapUrl });
    setError(null);
  }, []);

  const t0 = useMemo(() => orthoLayers.find((layer) => layer.slot === "T0") ?? null, [orthoLayers]);
  const t1 = useMemo(() => orthoLayers.find((layer) => layer.slot === "T1") ?? null, [orthoLayers]);

  const points = compareResult?.pointsGeoJson ?? null;

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 overflow-y-auto">
        <GeoTiffUpload onUploaded={handleUploaded} onCompareComplete={handleCompareComplete} />

        <BeforeAfterSlider beforeUrl={t0?.previewUrl ?? null} afterUrl={t1?.previewUrl ?? null} />

        {compareResult && points && (
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-xs text-slate-300">
            <h3 className="text-sm font-semibold text-white">Pontos detectados</h3>
            <p className="mt-1 text-slate-400">{compareResult.pointCount} regiões alteradas</p>
            <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {points.features.slice(0, 12).map((feature, index) => {
                const [lng, lat] = feature.geometry.coordinates;
                const risk = feature.properties.risk;
                return (
                  <li key={`${lng}-${lat}-${index}`} className="rounded-lg bg-slate-950/60 px-2 py-1.5">
                    <span style={{ color: riskColor(risk) }}>{riskLabel(risk)}</span>
                    {" · "}
                    {(feature.properties.intensity * 100).toFixed(1)}% · {lat.toFixed(5)},{" "}
                    {lng.toFixed(5)}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {error && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        )}
      </aside>

      <main className="relative min-h-[480px] lg:min-h-0">
        <MapboxMap
          orthoLayers={orthoLayers}
          heatmapUrl={compareResult?.heatmapUrl ?? null}
          heatmapBounds={compareResult?.bounds ?? null}
          points={points}
        />
      </main>
    </div>
  );
}

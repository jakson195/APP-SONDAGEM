import { useCallback, useEffect, useState } from "react";

import { EarthMap } from "./components/Map/EarthMap";

import { ErrorBoundary } from "./components/ErrorBoundary";

import { LayerPanel } from "./components/LayerPanel/LayerPanel";

import { InfoPanel } from "./components/InfoPanel/InfoPanel";

import { MeasureToolbar } from "./components/Toolbar/MeasureToolbar";

import { FlowTimeline } from "./components/Timeline/FlowTimeline";

import { MagnetometryLegend } from "./components/Legend/MagnetometryLegend";

import { StreamCategoryLegend } from "./components/Legend/StreamCategoryLegend";

import { GeologyChatPanel } from "./components/Chat/GeologyChatPanel";

import { useLayerCatalogBootstrap } from "./hooks/useLayerCatalogBootstrap";

import { notifyViewerReady } from "./lib/viewer-ready";

import type { FeatureInfo } from "./types";

import { usesMapboxEngine } from "./lib/map-config";

export default function App() {
  const [feature, setFeature] = useState<FeatureInfo | null>(null);
  const [cursor, setCursor] = useState({ lon: 0, lat: 0 });
  const hasMapbox = usesMapboxEngine();

  useLayerCatalogBootstrap();

  useEffect(() => {
    notifyViewerReady();
    const retry = window.setTimeout(() => notifyViewerReady(), 4000);
    const fallback = window.setTimeout(() => notifyViewerReady(), 10_000);
    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(fallback);
    };
  }, []);

  const onCursorMove = useCallback((lon: number, lat: number) => {
    setCursor((prev) =>
      prev.lon === lon && prev.lat === lat ? prev : { lon, lat },
    );
  }, []);

  return (
    <div className="relative h-full min-h-[100vh] w-full">
      <ErrorBoundary>
        <EarthMap onFeatureSelect={setFeature} onCursorMove={onCursorMove} />
      </ErrorBoundary>

      <LayerPanel />
      <InfoPanel feature={feature} onClose={() => setFeature(null)} />
      <MeasureToolbar />
      <GeologyChatPanel feature={feature} cursor={cursor} />
      <FlowTimeline />

      <div className="pointer-events-none absolute bottom-14 right-3 z-10 flex w-[240px] flex-col gap-2">
        <StreamCategoryLegend />
        <MagnetometryLegend />
      </div>

      <footer className="pointer-events-none absolute bottom-2 left-1/2 z-[5] -translate-x-1/2 rounded-full border border-white/10 bg-[#0c1220]/70 px-4 py-1 text-[10px] text-slate-400 backdrop-blur">
        {cursor.lat.toFixed(4)}°, {cursor.lon.toFixed(4)}°
        {!hasMapbox && " · Satélite Esri"}
      </footer>
    </div>
  );
}

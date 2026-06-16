import { useCallback, useEffect, useState } from "react";
import { EarthMap } from "./components/Map/EarthMap";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InfoPanel } from "./components/InfoPanel/InfoPanel";
import { LeilaoFilterPanel } from "./components/Leilao/LeilaoFilterPanel";
import { useAnmLeilaoBootstrap } from "./hooks/useAnmLeilaoBootstrap";
import { notifyAnmLeilaoViewerReady } from "./lib/anm-leilao-viewer-ready";
import type { FeatureInfo } from "./types";
import { usesMapboxEngine } from "./lib/map-config";

/** Viewer ANM Leilão SOPLE — independente do HidroGeo Brasil. */
export default function LeilaoApp() {
  const [feature, setFeature] = useState<FeatureInfo | null>(null);
  const [cursor, setCursor] = useState({ lon: 0, lat: 0 });
  const hasMapbox = usesMapboxEngine();

  useAnmLeilaoBootstrap();

  useEffect(() => {
    notifyAnmLeilaoViewerReady();
    const retry = window.setTimeout(() => notifyAnmLeilaoViewerReady(), 4000);
    const fallback = window.setTimeout(() => notifyAnmLeilaoViewerReady(), 10_000);
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

      <LeilaoFilterPanel />
      <InfoPanel feature={feature} onClose={() => setFeature(null)} />

      <footer className="pointer-events-none absolute bottom-2 left-1/2 z-[5] -translate-x-1/2 rounded-full border border-amber-500/20 bg-[#0c1220]/70 px-4 py-1 text-[10px] text-amber-200/70 backdrop-blur">
        ANM · Leilão SOPLE · {cursor.lat.toFixed(4)}°, {cursor.lon.toFixed(4)}°
        {!hasMapbox && " · Satélite Esri"}
      </footer>
    </div>
  );
}

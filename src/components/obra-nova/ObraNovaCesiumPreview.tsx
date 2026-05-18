"use client";

import {
  Cartesian3,
  GeoJsonDataSource,
  type Viewer as CesiumViewer,
} from "cesium";
import { useEffect, useRef, useState } from "react";
import type { Polygon } from "geojson";

import "cesium/Build/Cesium/Widgets/widgets.css";

import { createCesiumViewer } from "@/modules/digital-twin/viewer/cesium/createViewer";

/** Pré-visualização 3D do AOI — modo leve (sem terrain) para não bloquear a página. */
export function ObraNovaCesiumPreview(props: {
  polygon: Polygon | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL =
      "/cesium/";
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      try {
        setLoadError(null);
        const viewer = await createCesiumViewer(el, {
          chrome: "default",
          lightweight: true,
        });
        if (cancelled) {
          viewer.destroy();
          return;
        }
        viewerRef.current = viewer;
        setViewerReady(true);
      } catch {
        if (!cancelled) {
          setLoadError(
            "Pré-visualização 3D indisponível (rede ou token Cesium).",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      setViewerReady(false);
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewerReady || !viewerRef.current) return;
    const viewer = viewerRef.current;
    viewer.dataSources.removeAll();

    const lat = props.latitude ?? -15.75;
    const lng = props.longitude ?? -47.75;

    if (!props.polygon) {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, 180000),
        duration: 0.65,
      });
      return;
    }

    const fc = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: props.polygon,
        },
      ],
    };

    void GeoJsonDataSource.load(fc, { clampToGround: true }).then((ds) => {
      viewer.dataSources.add(ds);
      void viewer.zoomTo(ds).catch(() => undefined);
    });
  }, [viewerReady, props.polygon, props.latitude, props.longitude]);

  return (
    <div className="relative h-[300px] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-slate-950">
      <div ref={containerRef} className="absolute inset-0" />
      {!viewerReady && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-xs text-slate-300">
          A carregar vista 3D…
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-amber-200/90">
          {loadError}
        </div>
      )}
    </div>
  );
}

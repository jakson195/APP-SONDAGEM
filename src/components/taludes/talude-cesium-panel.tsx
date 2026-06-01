"use client";

import { useEffect, useRef } from "react";
import type { ChangePointsGeoJSON } from "@/lib/taludes/types";
import { riskColor } from "@/lib/taludes/risk";

type Props = {
  bounds?: [number, number, number, number] | null;
  points?: ChangePointsGeoJSON | null;
  heatmapUrl?: string | null;
};

export function TaludeCesiumPanel({ bounds, points, heatmapUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el) return;

    void (async () => {
      const Cesium = await import("cesium");
      await import("cesium/Build/Cesium/Widgets/widgets.css");

      const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (token) Cesium.Ion.defaultAccessToken = token;

      if (cancelled) return;

      const viewer = new Cesium.Viewer(el, {
        animation: false,
        timeline: false,
        baseLayerPicker: true,
        geocoder: false,
        homeButton: true,
        sceneModePicker: true,
        navigationHelpButton: false,
        fullscreenButton: false,
        terrain: Cesium.Terrain.fromWorldTerrain(),
      });
      viewerRef.current = viewer;

      if (bounds) {
        const [west, south, east, north] = bounds;
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
          duration: 1.2,
        });

        if (heatmapUrl) {
          viewer.entities.add({
            rectangle: {
              coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
              material: new Cesium.ImageMaterialProperty({
                image: heatmapUrl,
                transparent: true,
              }),
              height: 5,
            },
          });
        }
      }

      for (const f of points?.features ?? []) {
        const [lng, lat] = f.geometry.coordinates;
        const risk = f.properties.risk;
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lng, lat, 20),
          point: {
            pixelSize: 12,
            color: Cesium.Color.fromCssColorString(riskColor(risk)),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
          label: {
            text: risk.toUpperCase(),
            font: "11px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
          },
        });
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [bounds, points, heatmapUrl]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-700/80"
    />
  );
}

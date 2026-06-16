"use client";

import type { MapLayerMouseEvent } from "mapbox-gl";
import { useCallback, useEffect, useMemo, useState } from "react";
import Map, { Layer, Popup, Source } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

import { riskColor, riskLabel } from "@/lib/risk";
import type { ChangePointsGeoJSON, OrthoPreview } from "@/lib/types";

type MapboxMapProps = {
  orthoLayers: OrthoPreview[];
  heatmapUrl?: string | null;
  heatmapBounds?: [number, number, number, number] | null;
  points?: ChangePointsGeoJSON | null;
  onPointSelect?: (featureId: string) => void;
};

type PopupState = {
  longitude: number;
  latitude: number;
  intensity: number;
  risk: string;
};

function boundsToCoordinates(bounds: [number, number, number, number]): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  const [west, south, east, north] = bounds;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

export function MapboxMap({
  orthoLayers,
  heatmapUrl,
  heatmapBounds,
  points,
  onPointSelect,
}: MapboxMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [popup, setPopup] = useState<PopupState | null>(null);

  const viewState = useMemo(() => {
    const allBounds = [
      ...orthoLayers.map((layer) => layer.bounds),
      ...(heatmapBounds ? [heatmapBounds] : []),
    ];
    if (allBounds.length === 0) {
      return { longitude: -47.9, latitude: -15.8, zoom: 4 };
    }
    const west = Math.min(...allBounds.map((b) => b[0]));
    const south = Math.min(...allBounds.map((b) => b[1]));
    const east = Math.max(...allBounds.map((b) => b[2]));
    const north = Math.max(...allBounds.map((b) => b[3]));
    return {
      longitude: (west + east) / 2,
      latitude: (south + north) / 2,
      zoom: 14,
    };
  }, [orthoLayers, heatmapBounds]);

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") {
        setPopup(null);
        return;
      }
      const [longitude, latitude] = feature.geometry.coordinates as [number, number];
      const props = feature.properties as { intensity?: number; risk?: string };
      setPopup({
        longitude,
        latitude,
        intensity: Number(props.intensity ?? 0),
        risk: String(props.risk ?? "baixo"),
      });
      if (feature.id != null) onPointSelect?.(String(feature.id));
    },
    [onPointSelect],
  );

  useEffect(() => {
    setPopup(null);
  }, [points]);

  if (!token) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-center text-sm text-amber-200">
        Defina <code className="mx-1 rounded bg-black/40 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> no
        ficheiro <code className="mx-1 rounded bg-black/40 px-1">.env.local</code>.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
      <Map
        initialViewState={viewState}
        mapboxAccessToken={token}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["change-points-circle"]}
        onClick={handleMapClick}
      >
        {orthoLayers.map((layer) => (
          <Source
            key={layer.slot}
            id={`ortho-${layer.slot}`}
            type="image"
            url={layer.previewUrl}
            coordinates={boundsToCoordinates(layer.bounds)}
          >
            <Layer
              id={`ortho-layer-${layer.slot}`}
              type="raster"
              paint={{ "raster-opacity": layer.slot === "T0" ? 0.55 : 0.75 }}
            />
          </Source>
        ))}

        {heatmapUrl && heatmapBounds && (
          <Source
            id="change-heatmap-image"
            type="image"
            url={heatmapUrl}
            coordinates={boundsToCoordinates(heatmapBounds)}
          >
            <Layer
              id="change-heatmap-raster"
              type="raster"
              paint={{ "raster-opacity": 0.65 }}
            />
          </Source>
        )}

        {points && points.features.length > 0 && (
          <Source id="change-points" type="geojson" data={points}>
            <Layer
              id="change-points-heat"
              type="heatmap"
              paint={{
                "heatmap-weight": ["get", "intensity"],
                "heatmap-intensity": 1.2,
                "heatmap-radius": 28,
                "heatmap-opacity": 0.55,
              }}
            />
            <Layer
              id="change-points-circle"
              type="circle"
              paint={{
                "circle-radius": 8,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
                "circle-color": [
                  "match",
                  ["get", "risk"],
                  "alto",
                  riskColor("alto"),
                  "medio",
                  riskColor("medio"),
                  riskColor("baixo"),
                ],
              }}
            />
          </Source>
        )}

        {popup && (
          <Popup
            longitude={popup.longitude}
            latitude={popup.latitude}
            closeOnClick={false}
            onClose={() => setPopup(null)}
            className="change-popup"
          >
            <div className="space-y-1 p-1 text-xs">
              <p className="font-semibold text-slate-900">Mudança detectada</p>
              <p>
                Intensidade: <strong>{(popup.intensity * 100).toFixed(1)}%</strong>
              </p>
              <p>
                Risco:{" "}
                <span style={{ color: riskColor(popup.risk) }}>{riskLabel(popup.risk)}</span>
              </p>
              <p className="text-slate-600">
                {popup.latitude.toFixed(6)}, {popup.longitude.toFixed(6)}
              </p>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}

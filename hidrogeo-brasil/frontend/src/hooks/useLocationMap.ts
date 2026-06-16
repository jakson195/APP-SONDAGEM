import * as turf from "@turf/turf";
import { useCallback } from "react";
import { useLayerStore } from "../store/layerStore";
import { useMapToolsStore } from "../store/mapToolsStore";
import { buildActiveLegendItems } from "../layers/active-layer-legend";
import { parseCustomLegendText } from "../lib/custom-legend";
import {
  exportLocationMapPng,
  downloadBlob,
  sirgas2000UtmLabel,
} from "../lib/location-map-export";
import { isCaptureMostlyBlank } from "../lib/map-capture";
import type { MapLegendItem } from "../layers/active-layer-legend";

function closedRing(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const ring = [...points];
  const first = ring[0]!;
  const last = ring.at(-1)!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return ring;
}

function buildLegendItems(
  polygon: [number, number][] | undefined,
  visible: Record<string, boolean>,
  importedLayers: ReturnType<typeof useMapToolsStore.getState>["importedLayers"],
  includeAuto: boolean,
  customText: string,
): MapLegendItem[] {
  const items: MapLegendItem[] = [];

  if (polygon && polygon.length >= 3) {
    items.push({
      id: "study-area",
      label: "Área de estudo",
      color: "rgba(255, 0, 0, 0.35)",
      kind: "fill",
    });
  }

  if (includeAuto) {
    const importLegend = importedLayers
      .filter((l) => l.visible)
      .map((l) => ({
        id: l.id,
        label: l.name,
        color: `rgba(${l.color[0]}, ${l.color[1]}, ${l.color[2]}, ${(l.color[3] ?? 255) / 255})`,
        kind: "line" as const,
      }));
    items.push(...buildActiveLegendItems(visible, importLegend));
  }

  items.push(...parseCustomLegendText(customText));
  return items;
}

export function useLocationMap() {
  const visible = useLayerStore((s) => s.visible);
  const {
    mapCaptureApi,
    importedLayers,
    locationMapTitle,
    locationMapIncludeAutoLegend,
    locationMapCustomLegend,
    setLocationMapLoading,
  } = useMapToolsStore();

  const generate = useCallback(
    async (polygon?: [number, number][]) => {
      if (!mapCaptureApi) throw new Error("Mapa ainda não está pronto");

      setLocationMapLoading(true);
      try {
        await mapCaptureApi.waitForRender();

        let dataUrl = mapCaptureApi.captureCanvas();
        if (!dataUrl) throw new Error("Não foi possível capturar o mapa");
        if (await isCaptureMostlyBlank(dataUrl)) {
          await new Promise((r) => setTimeout(r, 1200));
          await mapCaptureApi.waitForRender();
          dataUrl = mapCaptureApi.captureCanvas();
        }
        if (!dataUrl || (await isCaptureMostlyBlank(dataUrl))) {
          throw new Error(
            "Captura do mapa falhou (imagem preta). Recarregue a página e tente novamente.",
          );
        }

        const { width, height } = mapCaptureApi.getCanvasSize();
        const bounds = mapCaptureApi.getBounds();
        const center = mapCaptureApi.getCenter();
        const bearing = mapCaptureApi.getBearing();
        const zoom = mapCaptureApi.getZoom();

        let areaLabel: string | undefined;
        if (polygon && polygon.length >= 3) {
          const ring = closedRing(polygon);
          const poly = turf.polygon([ring]);
          const areaKm2 = turf.area(poly) / 1e6;
          areaLabel = `Área delimitada: ${areaKm2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km²`;
        }

        const legendItems = buildLegendItems(
          polygon,
          visible,
          importedLayers,
          locationMapIncludeAutoLegend,
          locationMapCustomLegend,
        );

        const blob = await exportLocationMapPng({
          mapDataUrl: dataUrl,
          mapWidth: width,
          mapHeight: height,
          bounds,
          bearing,
          legendItems,
          title: locationMapTitle.trim() || "Mapa de localização",
          areaLabel,
          crsLabel: `${sirgas2000UtmLabel(center.lon, center.lat)} · EPSG:4326 (WGS 84)`,
          zoomLabel: `Zoom: ${zoom.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`,
          dateLabel: `Data: ${new Date().toLocaleDateString("pt-BR")}`,
        });

        const stamp = new Date().toISOString().slice(0, 10);
        downloadBlob(blob, `mapa-localizacao-${stamp}.png`);
      } finally {
        setLocationMapLoading(false);
      }
    },
    [
      mapCaptureApi,
      importedLayers,
      locationMapTitle,
      locationMapIncludeAutoLegend,
      locationMapCustomLegend,
      setLocationMapLoading,
      visible,
    ],
  );

  return { generate };
}

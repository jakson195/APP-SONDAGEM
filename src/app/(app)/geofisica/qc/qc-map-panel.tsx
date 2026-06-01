"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LineQcMetrics } from "@/lib/geofisica/qc/qc-types";
import { QC_GRADE_COLORS } from "@/lib/geofisica/qc/qc-types";
import {
  lineEndWgs84,
  profilePointWgs84,
  type QcSurveyLine,
} from "@/lib/geofisica/qc/qc-survey-types";

type Props = {
  lines: QcSurveyLine[];
  reportLines: LineQcMetrics[];
  activeLineId?: string | null;
  onLineSelect?: (lineId: string) => void;
  className?: string;
};

const SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function QcMapPanel({
  lines,
  reportLines,
  activeLineId,
  onLineSelect,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onLineSelect);
  onSelectRef.current = onLineSelect;

  const draw = useCallback(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    const metricsById = new Map(reportLines.map((l) => [l.lineId, l]));
    const bounds: L.LatLng[] = [];

    for (const line of lines) {
      const metrics = metricsById.get(line.id);
      const grade = metrics?.grade ?? "yellow";
      const color = QC_GRADE_COLORS[grade].hex;
      const isActive = line.id === activeLineId;
      const start = { lat: line.anchorLat, lng: line.anchorLng };
      const end = lineEndWgs84(line);

      bounds.push(L.latLng(start.lat, start.lng), L.latLng(end.lat, end.lng));

      L.polyline(
        [
          [start.lat, start.lng],
          [end.lat, end.lng],
        ],
        {
          color,
          weight: isActive ? 5 : 3,
          opacity: isActive ? 1 : 0.85,
        },
      )
        .bindTooltip(`${line.name} — SNR ${metrics?.snr.toFixed(1) ?? "—"}`)
        .on("click", () => onSelectRef.current?.(line.id))
        .addTo(group);

      if (metrics) {
        for (const pt of metrics.readingPoints) {
          const pos = profilePointWgs84(line, pt.stationM);
          bounds.push(L.latLng(pos.lat, pos.lng));
          L.circleMarker([pos.lat, pos.lng], {
            radius: pt.isSpike ? 5 : 3,
            color: QC_GRADE_COLORS[pt.grade].hex,
            fillColor: QC_GRADE_COLORS[pt.grade].hex,
            fillOpacity: 0.95,
            weight: pt.isSpike ? 2 : 1,
          })
            .bindTooltip(
              `${line.name} @ ${pt.stationM.toFixed(0)} m — ρ=${pt.rhoOhmM.toFixed(1)} Ω·m`,
            )
            .addTo(group);
        }
      }
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [32, 32], maxZoom: 18 });
    }
  }, [lines, reportLines, activeLineId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center =
      lines[0] != null
        ? [lines[0].anchorLat, lines[0].anchorLng] as [number, number]
        : ([-26.3, -48.65] as [number, number]);

    const map = L.map(containerRef.current, {
      center,
      zoom: 15,
      zoomControl: true,
    });
    L.tileLayer(SATELLITE, {
      attribution: "Esri World Imagery",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [lines.length]);

  return (
    <div
      ref={containerRef}
      className={`min-h-[280px] w-full rounded-lg border border-[var(--border)] ${className}`}
    />
  );
}

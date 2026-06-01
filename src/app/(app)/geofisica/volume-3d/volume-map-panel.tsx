"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeophysSurveyLine, SectionPoint3D } from "@/lib/geofisica/volume3d/volume3d-types";
import type { ImportedKmlTrack } from "@/lib/geofisica/volume3d/parse-kml-kmz";
import { geometryStartEndWgs84, wgs84ToGeometryPoint } from "@/lib/geofisica/volume3d/geometry-coords";
import { GeoContextLayersToggle } from "@/components/geo-context-layers-toggle";
import { syncMapContextLayers, ensureContextLayerPane } from "@/lib/geofisica/geodata/map-context-layers";

export type MapDrawState = {
  lineId: string;
  step: "start" | "end";
  previewStart?: { lat: number; lng: number };
};

type Props = {
  lines: GeophysSurveyLine[];
  anchorLat: number;
  anchorLng: number;
  projectOrigin: SectionPoint3D;
  activeLineId?: string | null;
  pickTarget?: "start" | "end" | null;
  drawState?: MapDrawState | null;
  enableDrag?: boolean;
  onMapPick?: (
    lineId: string,
    target: "start" | "end",
    lat: number,
    lng: number,
  ) => void;
  onDrawPoint?: (
    lineId: string,
    target: "start" | "end",
    lat: number,
    lng: number,
  ) => void;
  onEndpointDrag?: (
    lineId: string,
    target: "start" | "end",
    lat: number,
    lng: number,
  ) => void;
  onLineSelect?: (lineId: string) => void;
  /** Percursos KML/KMZ importados (mantidos no mapa). */
  kmlTracks?: ImportedKmlTrack[];
  highlightedKmlTrackId?: string | null;
  lineKmlAssignment?: Record<string, string>;
  onKmlTrackSelect?: (trackId: string) => void;
  /** Incrementar para centrar o mapa em todas as linhas. */
  fitToken?: number;
  className?: string;
};

const SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function handleIcon(color: string, size = 14): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);cursor:grab;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function VolumeMapPanel({
  lines,
  anchorLat,
  anchorLng,
  projectOrigin,
  activeLineId,
  pickTarget,
  drawState,
  enableDrag = true,
  onMapPick,
  onDrawPoint,
  onEndpointDrag,
  onLineSelect,
  kmlTracks = [],
  highlightedKmlTrackId,
  lineKmlAssignment = {},
  onKmlTrackSelect,
  fitToken = 0,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const kmlLayerRef = useRef<L.LayerGroup | null>(null);
  const linesLayerRef = useRef<L.LayerGroup | null>(null);
  const contextLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const onMapPickRef = useRef(onMapPick);
  const onDrawPointRef = useRef(onDrawPoint);
  const onEndpointDragRef = useRef(onEndpointDrag);
  const onLineSelectRef = useRef(onLineSelect);
  const onKmlTrackSelectRef = useRef(onKmlTrackSelect);
  const activeLineIdRef = useRef(activeLineId);
  const pickTargetRef = useRef(pickTarget);
  const drawStateRef = useRef(drawState);
  const linesRef = useRef(lines);
  const kmlTracksRef = useRef(kmlTracks);
  const projectOriginRef = useRef(projectOrigin);
  const lineCountRef = useRef(lines.length);
  const kmlCountRef = useRef(kmlTracks.length);
  const fitTokenRef = useRef(fitToken);
  const [ready, setReady] = useState(false);
  const [activeContextLayers, setActiveContextLayers] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleContextLayer = useCallback((id: string) => {
    setActiveContextLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  onMapPickRef.current = onMapPick;
  onDrawPointRef.current = onDrawPoint;
  onEndpointDragRef.current = onEndpointDrag;
  onLineSelectRef.current = onLineSelect;
  onKmlTrackSelectRef.current = onKmlTrackSelect;
  activeLineIdRef.current = activeLineId;
  pickTargetRef.current = pickTarget;
  drawStateRef.current = drawState;
  linesRef.current = lines;
  kmlTracksRef.current = kmlTracks;
  projectOriginRef.current = projectOrigin;

  const drawKmlTracks = useCallback(() => {
    const group = kmlLayerRef.current;
    if (!group) return;
    group.clearLayers();

    const bounds: L.LatLng[] = [];

    for (const track of kmlTracks) {
      if (track.coordinates.length < 2) continue;
      const latlngs = track.coordinates.map(
        (c) => [c.lat, c.lng] as [number, number],
      );
      latlngs.forEach(([lat, lng]) => bounds.push(L.latLng(lat, lng)));

      const assignedLineId = Object.entries(lineKmlAssignment).find(
        ([, tid]) => tid === track.id,
      )?.[0];
      const assignedToActive =
        activeLineId != null && lineKmlAssignment[activeLineId] === track.id;
      const highlighted = track.id === highlightedKmlTrackId;

      L.polyline(latlngs, {
        color: track.color,
        weight: highlighted || assignedToActive ? 6 : 4,
        opacity: highlighted || assignedToActive ? 1 : 0.85,
        dashArray: assignedToActive ? undefined : "10 6",
      })
        .bindTooltip(
          `${track.fileName} — ${track.name}${assignedLineId ? " · associado" : " · clique para associar"}`,
        )
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onKmlTrackSelectRef.current?.(track.id);
        })
        .addTo(group);

      const first = track.coordinates[0]!;
      const last = track.coordinates[track.coordinates.length - 1]!;
      L.circleMarker([first.lat, first.lng], {
        radius: 5,
        color: "#fff",
        weight: 1,
        fillColor: track.color,
        fillOpacity: 0.9,
      })
        .bindTooltip(`${track.name} — início`)
        .addTo(group);
      L.circleMarker([last.lat, last.lng], {
        radius: 5,
        color: "#fff",
        weight: 1,
        fillColor: track.color,
        fillOpacity: 0.5,
      })
        .bindTooltip(`${track.name} — fim`)
        .addTo(group);
    }

    return bounds;
  }, [
    kmlTracks,
    lineKmlAssignment,
    activeLineId,
    highlightedKmlTrackId,
  ]);

  const drawLines = useCallback(() => {
    const map = mapRef.current;
    const group = linesLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    const bounds: L.LatLng[] = drawKmlTracks() ?? [];

    if (drawState?.previewStart) {
      bounds.push(
        L.latLng(drawState.previewStart.lat, drawState.previewStart.lng),
      );
      L.marker(
        [drawState.previewStart.lat, drawState.previewStart.lng],
        { icon: handleIcon("#fde047", 16), draggable: false },
      )
        .bindTooltip("A — aguardando ponto B")
        .addTo(group);
    }

    for (const line of lines) {
      const { start, end } = geometryStartEndWgs84(line.geometry);
      const isActive = line.id === activeLineId;
      const isDrawing = drawState?.lineId === line.id;
      bounds.push(L.latLng(start.lat, start.lng), L.latLng(end.lat, end.lng));

      L.polyline(
        [
          [start.lat, start.lng],
          [end.lat, end.lng],
        ],
        {
          color: isActive || isDrawing ? "#f59e0b" : "#0d9488",
          weight: isActive || isDrawing ? 4 : 3,
        },
      )
        .bindTooltip(line.name)
        .on("click", () => onLineSelectRef.current?.(line.id))
        .addTo(group);

      const dragActive = enableDrag && (isActive || isDrawing);

      for (const [target, pt, color, activeColor] of [
        ["start", start, "#22c55e", "#fde047"],
        ["end", end, "#ef4444", "#fde047"],
      ] as const) {
        const picking =
          (pickTarget === target && isActive) ||
          (drawState?.step === target && isDrawing);
        const marker = L.marker([pt.lat, pt.lng], {
          icon: handleIcon(picking ? activeColor : color, picking ? 16 : 14),
          draggable: dragActive,
        })
          .bindTooltip(
            `${line.name} — ${target === "start" ? "A (início)" : "B (final)"}${dragActive ? " · arraste para mover" : ""}`,
          )
          .addTo(group);

        if (dragActive) {
          marker.on("dragend", () => {
            const ll = marker.getLatLng();
            onEndpointDragRef.current?.(line.id, target, ll.lat, ll.lng);
          });
        }

        marker.on("click", () => {
          onLineSelectRef.current?.(line.id);
        });
      }
    }

    if (bounds.length > 0) {
      const countChanged =
        lines.length !== lineCountRef.current ||
        kmlTracks.length !== kmlCountRef.current;
      const fitRequested = fitToken !== fitTokenRef.current;
      if (countChanged || !lineCountRef.current || fitRequested) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 18 });
        lineCountRef.current = lines.length;
        kmlCountRef.current = kmlTracks.length;
        fitTokenRef.current = fitToken;
      }
    }
  }, [
    lines,
    activeLineId,
    pickTarget,
    drawState,
    enableDrag,
    fitToken,
    kmlTracks.length,
    drawKmlTracks,
  ]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [anchorLat, anchorLng],
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer(SATELLITE, {
      attribution: "Esri World Imagery",
      maxZoom: 19,
    }).addTo(map);

    ensureContextLayerPane(map);
    kmlLayerRef.current = L.layerGroup().addTo(map);
    linesLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("click", (e) => {
      const draw = drawStateRef.current;
      const drawHandler = onDrawPointRef.current;
      if (draw && drawHandler) {
        drawHandler(draw.lineId, draw.step, e.latlng.lat, e.latlng.lng);
        return;
      }

      const handler = onMapPickRef.current;
      const lineId = activeLineIdRef.current;
      const target = pickTargetRef.current;
      if (!handler || !lineId || !target) return;
      handler(lineId, target, e.latlng.lat, e.latlng.lng);
    });

    setReady(true);

    return () => {
      contextLayersRef.current.forEach((layer) => layer.remove());
      contextLayersRef.current.clear();
      map.remove();
      mapRef.current = null;
      kmlLayerRef.current = null;
      linesLayerRef.current = null;
    };
  }, [anchorLat, anchorLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncMapContextLayers(map, activeContextLayers, contextLayersRef.current, L);
  }, [activeContextLayers, ready]);

  useEffect(() => {
    if (ready) drawLines();
  }, [ready, drawLines]);

  const statusText = (() => {
    if (drawState) {
      return drawState.step === "start"
        ? "Clique no mapa para o ponto A (início) da nova linha"
        : "Clique no mapa para o ponto B (final) da linha";
    }
    if (pickTarget && activeLineId) {
      return `Clique no mapa para definir ponto ${pickTarget === "start" ? "A (início)" : "B (final)"} — ou arraste os marcadores`;
    }
    if (enableDrag && activeLineId) {
      return "Arraste A/B · clique no percurso KML colorido para associar à secção activa";
    }
    if (kmlTracks.length > 0) {
      return `${kmlTracks.length} percurso(s) KML no mapa — seleccione secção e clique no percurso ou use o menu`;
    }
    return "Mapa satélite — A (verde) e B (vermelho) georreferenciados";
  })();

  return (
    <div
      className={`overflow-hidden rounded-lg border border-[var(--border)] ${className}`}
    >
      <div ref={containerRef} className="h-[280px] w-full" />
      <p className="border-t border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[10px] text-[var(--muted)]">
        {statusText}
      </p>
      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-2">
        <GeoContextLayersToggle
          activeIds={activeContextLayers}
          onToggle={toggleContextLayer}
        />
      </div>
    </div>
  );
}

export function mapClickToGeometryPoint(
  lat: number,
  lng: number,
  zM: number,
  line: GeophysSurveyLine,
  projectOrigin: SectionPoint3D,
) {
  return wgs84ToGeometryPoint(
    lat,
    lng,
    zM,
    line.geometry.coordMode ?? "wgs84",
    line.geometry.coordMode === "project"
      ? (line.geometry.projectOrigin ?? projectOrigin)
      : undefined,
  );
}

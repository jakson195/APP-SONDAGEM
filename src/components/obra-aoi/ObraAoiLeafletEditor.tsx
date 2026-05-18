"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import type { LeafletLatLng } from "@/lib/obra-aoi-leaflet";

const vertexIcon = L.divIcon({
  className: "obra-aoi-vertex-icon",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: '<span style="display:block;width:14px;height:14px;border-radius:50%;background:#facc15;border:2px solid #fef08a;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>',
});

function VertexCollector({
  enabled,
  onPoint,
}: {
  enabled: boolean;
  onPoint: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPoint(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DraggableVertex({
  position,
  index,
  editable,
  onMove,
}: {
  position: LeafletLatLng;
  index: number;
  editable: boolean;
  onMove: (index: number, lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !editable) return;
    const handler = () => {
      const ll = marker.getLatLng();
      onMove(index, ll.lat, ll.lng);
    };
    marker.on("dragend", handler);
    return () => {
      marker.off("dragend", handler);
    };
  }, [index, editable, onMove]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      draggable={editable}
      icon={vertexIcon}
    />
  );
}

export function ObraAoiLeafletEditor(props: {
  center: LeafletLatLng;
  zoom: number;
  vertices: LeafletLatLng[];
  drawing: boolean;
  editing: boolean;
  polygonClosed: boolean;
  onAddVertex: (lat: number, lng: number) => void;
  onVertexMove: (index: number, lat: number, lng: number) => void;
  hint?: string;
}) {
  const positionsClosed =
    props.vertices.length >= 3
      ? [...props.vertices, props.vertices[0]!]
      : null;

  const hint =
    props.hint ??
    (props.editing
      ? "Arraste os pontos amarelos para alterar o tamanho e a forma · clique para acrescentar vértices se estiver a redesenhar"
      : props.drawing
        ? "Clique no mapa para marcar vértices · mínimo 3 pontos antes de fechar"
        : "Ative «Editar vértices» ou «Redesenhar» para alterar a área");

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-slate-900/40">
      <MapContainer
        center={props.center}
        zoom={props.zoom}
        className="z-0 h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <VertexCollector
          enabled={props.drawing && !props.polygonClosed}
          onPoint={props.onAddVertex}
        />
        {props.vertices.length >= 2 && !props.polygonClosed && (
          <Polyline
            positions={props.vertices}
            pathOptions={{ color: "#38bdf8", weight: 3 }}
          />
        )}
        {positionsClosed && props.polygonClosed ? (
          <Polygon
            positions={positionsClosed}
            pathOptions={{
              color: props.editing ? "#f59e0b" : "#22c55e",
              fillColor: props.editing ? "#f59e0b" : "#22c55e",
              fillOpacity: 0.22,
              weight: 2,
            }}
          />
        ) : null}
        {props.vertices.map((p, i) =>
          props.editing ? (
            <DraggableVertex
              key={`v-${i}`}
              position={p}
              index={i}
              editable
              onMove={props.onVertexMove}
            />
          ) : (
            <Marker
              key={`v-${i}`}
              position={p}
              icon={vertexIcon}
              interactive={false}
            />
          ),
        )}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg bg-black/60 px-2 py-1.5 text-center text-[11px] text-white backdrop-blur-sm">
        {hint}
      </div>
    </div>
  );
}

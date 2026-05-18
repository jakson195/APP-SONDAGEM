"use client";

import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

/** `[latitude, longitude]` para Leaflet */
export type LeafletLatLng = [number, number];

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

export function ObraNovaLeafletMap(props: {
  center: LeafletLatLng;
  zoom: number;
  vertices: LeafletLatLng[];
  drawing: boolean;
  polygonClosed: boolean;
  onAddVertex: (lat: number, lng: number) => void;
}) {
  const positionsClosed =
    props.vertices.length >= 3
      ? [...props.vertices, props.vertices[0]!]
      : null;

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
        <VertexCollector enabled={props.drawing} onPoint={props.onAddVertex} />
        {props.vertices.length >= 2 && (
          <Polyline
            positions={props.vertices}
            pathOptions={{ color: "#38bdf8", weight: 3 }}
          />
        )}
        {positionsClosed && props.polygonClosed ? (
          <Polygon
            positions={positionsClosed}
            pathOptions={{
              color: "#22c55e",
              fillColor: "#22c55e",
              fillOpacity: 0.22,
              weight: 2,
            }}
          />
        ) : null}
        {props.vertices.map((p, i) => (
          <CircleMarker
            key={`${p[0].toFixed(5)},${p[1].toFixed(5)},${i}`}
            center={p}
            radius={6}
            pathOptions={{
              color: "#fef08a",
              fillColor: "#facc15",
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg bg-black/60 px-2 py-1.5 text-center text-[11px] text-white backdrop-blur-sm">
        {props.drawing
          ? "Clique no mapa para marcar vértices · mínimo 3 pontos antes de fechar"
          : 'Ative “Desenhar AOI” para definir o polígono da área de interesse'}
      </div>
    </div>
  );
}

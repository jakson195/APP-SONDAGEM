"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import type { GeoPhoto, StreetFrame } from "../types";

type GeoMapProps = {
  photos: GeoPhoto[];
  frames: StreetFrame[];
  selectedPhotoId: number | null;
  selectedFrameId: string | null;
  onSelectPhoto: (photoId: number) => void;
  onSelectFrame: (frameId: string) => void;
};

function buildPin(color: string, ringColor: string) {
  return L.divIcon({
    className: "geo-media-pin",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 0 0 4px ${ringColor};"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const photoIcon = buildPin("#059669", "rgba(5,150,105,0.18)");
const photoActiveIcon = buildPin("#10b981", "rgba(16,185,129,0.35)");
const frameIcon = buildPin("#4f46e5", "rgba(79,70,229,0.18)");
const frameActiveIcon = buildPin("#6366f1", "rgba(99,102,241,0.35)");

function formatDate(value: string | null): string {
  if (!value) return "Sem data";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Sem data";
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function FitBounds({
  points,
}: {
  points: Array<{ latitude: number; longitude: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0]!.latitude, points[0]!.longitude], 16, { animate: false });
      return;
    }
    const bounds = L.latLngBounds(
      points.map((point) => [point.latitude, point.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
  }, [map, points]);

  return null;
}

function MapClickHandler({
  frames,
  onSelectFrame,
}: {
  frames: StreetFrame[];
  onSelectFrame: (frameId: string) => void;
}) {
  useMapEvents({
    click(event) {
      const clicked = { lat: event.latlng.lat, lng: event.latlng.lng };
      const candidates = frames.filter(
        (frame) => frame.latitude != null && frame.longitude != null,
      );
      if (candidates.length === 0) return;

      const nearest = candidates
        .map((frame) => ({
          frame,
          distance: haversineMeters(clicked, {
            lat: frame.latitude!,
            lng: frame.longitude!,
          }),
        }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (nearest) {
        onSelectFrame(nearest.frame.id);
      }
    },
  });
  return null;
}

export function GeoMap({
  photos,
  frames,
  selectedPhotoId,
  selectedFrameId,
  onSelectPhoto,
  onSelectFrame,
}: GeoMapProps) {
  const points = useMemo(
    () => [
      ...photos.map((photo) => ({
        latitude: photo.latitude,
        longitude: photo.longitude,
      })),
      ...frames
        .filter((frame) => frame.latitude != null && frame.longitude != null)
        .map((frame) => ({
          latitude: frame.latitude!,
          longitude: frame.longitude!,
        })),
    ],
    [frames, photos],
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">Mapa GEO</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Clique no mapa para abrir o frame de rua mais pr&oacute;ximo no viewer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-300">
            Fotos
          </span>
          <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-indigo-700 dark:text-indigo-300">
            Frames
          </span>
        </div>
      </div>

      <div className="h-[26rem] w-full [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full">
        <MapContainer
          center={[-27.5969, -48.5495]}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          <MapClickHandler frames={frames} onSelectFrame={onSelectFrame} />

          {photos.map((photo) => (
            <Marker
              key={`photo-${photo.id}`}
              position={[photo.latitude, photo.longitude]}
              icon={selectedPhotoId === photo.id ? photoActiveIcon : photoIcon}
              eventHandlers={{ click: () => onSelectPhoto(photo.id) }}
            >
              <Popup>
                <div className="w-56 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.imageUrl}
                    alt={photo.originalName ?? `Foto ${photo.id}`}
                    className="mb-2 h-32 w-full rounded-lg object-cover"
                  />
                  <p className="font-semibold text-[var(--text)]">
                    {photo.originalName ?? `Foto #${photo.id}`}
                  </p>
                  <p className="mt-1 font-mono text-[11px]">
                    {photo.latitude.toFixed(6)}, {photo.longitude.toFixed(6)}
                  </p>
                  <p className="mt-1 text-[var(--muted)]">{formatDate(photo.capturedAt)}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {frames
            .filter((frame) => frame.latitude != null && frame.longitude != null)
            .map((frame) => (
              <Marker
                key={`frame-${frame.id}`}
                position={[frame.latitude!, frame.longitude!]}
                icon={selectedFrameId === frame.id ? frameActiveIcon : frameIcon}
                eventHandlers={{ click: () => onSelectFrame(frame.id) }}
              >
                <Popup>
                  <div className="w-56 text-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frame.imageUrl}
                      alt={`Frame ${frame.frameIndex + 1}`}
                      className="mb-2 h-32 w-full rounded-lg object-cover"
                    />
                    <p className="font-semibold text-[var(--text)]">
                      Frame {frame.frameIndex + 1}
                    </p>
                    <p className="mt-1 font-mono text-[11px]">
                      {frame.latitude!.toFixed(6)}, {frame.longitude!.toFixed(6)}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">
                      Heading {frame.heading != null ? `${frame.heading.toFixed(1)}°` : "n/d"}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">{formatDate(frame.timestamp)}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </div>
    </section>
  );
}

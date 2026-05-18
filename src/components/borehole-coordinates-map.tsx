"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_JS_LOADER_ID } from "@/lib/google-maps-js-loader-id";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps-libraries";

const MAP_ZOOM = 15;

/** Approximate center of Brazil when no valid WGS84 point is set */
const DEFAULT_CENTER: google.maps.LatLngLiteral = {
  lat: -14.235004,
  lng: -51.92528,
};

const mapContainerStyle: CSSProperties = {
  width: "100%",
  height: "280px",
};

const mapOptions: google.maps.MapOptions = {
  streetViewControl: false,
  mapTypeControl: true,
  fullscreenControl: true,
  zoomControl: true,
};

type Props = {
  coordX: string;
  coordY: string;
  onCoordinatesChange: (x: string, y: string) => void;
  className?: string;
  /** Texto de ajuda abaixo do mapa (default em inglês para boreholes). */
  hint?: ReactNode;
};

/** Parse X → longitude, Y → latitude (decimal degrees, WGS84). */
function parseLatLng(
  x: string,
  y: string,
): google.maps.LatLngLiteral | null {
  const lng = parseFloat(x);
  const lat = parseFloat(y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function MapMissingKeyMessage({ className }: { className: string }) {
  return (
    <div
      className={`rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--muted)] ${className}`}
    >
      <p className="font-medium text-[var(--text)]">Map unavailable</p>
      <p className="mt-1">
        Add{" "}
        <code className="rounded bg-black/5 px-1 font-mono text-xs dark:bg-white/10">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        to <code className="font-mono text-xs">.env.local</code> and restart the dev server.
      </p>
    </div>
  );
}

/**
 * `useJsApiLoader` keeps a singleton per `id`. Calling it with an empty key and later
 * with a real key throws. Only mount this after `apiKey` is non-empty.
 */
function BoreholeCoordinatesMapWithKey({
  apiKey,
  coordX,
  coordY,
  onCoordinatesChange,
  className = "",
  hint,
}: Props & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_JS_LOADER_ID,
    googleMapsApiKey: apiKey,
    libraries: [...GOOGLE_MAPS_LIBRARIES],
  });

  const position = useMemo(
    () => parseLatLng(coordX, coordY),
    [coordX, coordY],
  );

  const center = useMemo(
    () => position ?? DEFAULT_CENTER,
    [position],
  );

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      onCoordinatesChange(
        ll.lng().toFixed(6),
        ll.lat().toFixed(6),
      );
    },
    [onCoordinatesChange],
  );

  if (loadError) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 ${className}`}
      >
        Could not load Google Maps. Check the API key and enabled Maps JavaScript API.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className={`flex h-[280px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)] ${className}`}
      >
        Loading map…
      </div>
    );
  }

  return (
    <div className={className}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        mapContainerClassName="overflow-hidden rounded-lg border border-[var(--border)]"
        center={center}
        zoom={MAP_ZOOM}
        options={mapOptions}
        onClick={onMapClick}
      >
        {position && <Marker position={position} />}
      </GoogleMap>
      {hint ?? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Click the map to set <span className="text-[var(--text)]">X</span> (longitude) and{" "}
          <span className="text-[var(--text)]">Y</span> (latitude) in decimal degrees (WGS84). Zoom:{" "}
          {MAP_ZOOM}.
        </p>
      )}
    </div>
  );
}

export function BoreholeCoordinatesMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  if (!apiKey) {
    return <MapMissingKeyMessage className={props.className ?? ""} />;
  }
  return (
    <BoreholeCoordinatesMapWithKey
      {...props}
      apiKey={apiKey}
      hint={props.hint}
    />
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ensureContextLayerPane,
  syncMapContextLayers,
} from "@/lib/geofisica/geodata/map-context-layers";
import { GeoContextLayersToggle } from "@/components/geo-context-layers-toggle";
import type { GeoSurveyLocation } from "@/lib/geofisica/dipolo2d/interpret-types";
import { GARUVA_DEFAULT_LOCATION } from "@/lib/geofisica/dipolo2d/regional-geology";

const ICON_CDN = "https://unpkg.com/leaflet@1.9.4/dist/images/";

/** Overlays GeoSGB desligados por defeito — evitam travar o mapa. */
const DEFAULT_OVERLAYS = new Set<string>();

type Props = {
  location: GeoSurveyLocation | null;
  onLocationChange: (loc: GeoSurveyLocation) => void;
  onMapPick?: (loc: GeoSurveyLocation) => void;
  className?: string;
};

export function DipoloLocationMap({
  location,
  onLocationChange,
  onMapPick,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const overlayLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const onLocationChangeRef = useRef(onLocationChange);
  const onMapPickRef = useRef(onMapPick);
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(
    () => new Set(DEFAULT_OVERLAYS),
  );
  const [mapReady, setMapReady] = useState(false);

  onLocationChangeRef.current = onLocationChange;
  onMapPickRef.current = onMapPick;

  const placeMarker = useCallback((lat: number, lng: number, map?: L.Map) => {
    const m = map ?? mapRef.current;
    if (!m) return;
    const latlng: L.LatLngExpression = [lat, lng];
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
    } else {
      markerRef.current = L.marker(latlng, { draggable: true }).addTo(m);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current?.getLatLng();
        if (!pos) return;
        const picked: GeoSurveyLocation = {
          lat: pos.lat,
          lng: pos.lng,
          label: "Linha ERT",
        };
        onLocationChangeRef.current(picked);
        onMapPickRef.current?.(picked);
      });
    }
  }, []);

  const flyToLocation = useCallback((loc: GeoSurveyLocation) => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = loc.zoom ?? 13;
    map.flyTo([loc.lat, loc.lng], zoom, { duration: 0.55 });
    placeMarker(loc.lat, loc.lng, map);
  }, [placeMarker]);

  const syncOverlays = useCallback((map: L.Map, active: Set<string>) => {
    syncMapContextLayers(map, active, overlayLayersRef.current, L);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: `${ICON_CDN}marker-icon-2x.png`,
      iconUrl: `${ICON_CDN}marker-icon.png`,
      shadowUrl: `${ICON_CDN}marker-shadow.png`,
    });

    const start = location ?? GARUVA_DEFAULT_LOCATION;
    const map = L.map(el, {
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
    }).setView([start.lat, start.lng], 12);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles © Esri" },
    ).addTo(map);

    ensureContextLayerPane(map);
    syncOverlays(map, activeOverlays);
    placeMarker(start.lat, start.lng, map);

    map.on("click", (e) => {
      const { lat, lng } = e.latlng;
      placeMarker(lat, lng, map);
      const picked: GeoSurveyLocation = {
        lat,
        lng,
        label: "Linha ERT",
      };
      onLocationChangeRef.current(picked);
      onMapPickRef.current?.(picked);
    });

    mapRef.current = map;
    setMapReady(true);

    let disposed = false;
    const fix = () => {
      if (disposed || mapRef.current !== map) return;
      try {
        map.invalidateSize();
      } catch {
        /* ignore */
      }
    };
    const fixTimer = window.setTimeout(fix, 250);
    window.addEventListener("resize", fix);

    return () => {
      disposed = true;
      window.clearTimeout(fixTimer);
      window.removeEventListener("resize", fix);
      overlayLayersRef.current.forEach((layer) => layer.remove());
      overlayLayersRef.current.clear();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, [placeMarker, syncOverlays]);

  useEffect(() => {
    if (!mapRef.current) return;
    syncOverlays(mapRef.current, activeOverlays);
  }, [activeOverlays, syncOverlays, mapReady]);

  /** Atualiza pin — sem recentrar (clique / arrastar). */
  useEffect(() => {
    if (!mapRef.current || !location) return;
    placeMarker(location.lat, location.lng);
  }, [location?.lat, location?.lng, placeMarker, mapReady]);

  /** Só voar ao centro quando vier busca de cidade (zoom definido). */
  useEffect(() => {
    if (!mapRef.current || !location || location.zoom == null) return;
    flyToLocation(location);
  }, [location?.zoom, location?.lat, location?.lng, location?.at, flyToLocation, mapReady]);

  const toggleOverlay = (id: string) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      <div
        ref={containerRef}
        className="relative z-0 h-[280px] w-full shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-slate-900/20 [&_.leaflet-container]:z-0 [&_.leaflet-container]:!h-full [&_.leaflet-container]:!w-full [&_.leaflet-pane]:!z-auto"
        style={{ touchAction: "none" }}
      />
      <p className="text-xs font-medium text-[var(--text)]">
        Clique no mapa ou arraste o alfinete azul para marcar a linha ERT.
      </p>
      <GeoContextLayersToggle
        activeIds={activeOverlays}
        onToggle={toggleOverlay}
      />
    </div>
  );
}

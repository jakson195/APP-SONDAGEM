"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GeoContextLayersToggle } from "@/components/geo-context-layers-toggle";
import {
  syncMapContextLayers,
  ensureContextLayerPane,
  SCENE_MAP_PANE,
} from "@/lib/geofisica/geodata/map-context-layers";
import { indexGridToDataUrl } from "@/lib/geo/temporal/change-detection";
import { bboxFromMapCenter } from "@/lib/geo/temporal/brazil-bbox";
import { fetchLandsatSceneForDate } from "@/lib/geo/temporal/providers/landsat-stac-provider";
import {
  ESRI_WORLD_IMAGERY,
  isPhotoSpectralIndex,
  visualModeForDate,
} from "@/lib/geo/temporal/stac-visual";
import type {
  SpectralIndex,
  TemporalScene,
  Wgs84Bbox,
} from "@/lib/geo/temporal/temporal-types";

type Props = {
  bbox: Wgs84Bbox;
  sceneA: TemporalScene | null;
  sceneB: TemporalScene | null;
  spectralIndex?: SpectralIndex;
  demoMode?: boolean;
  splitPct?: number;
  showSplit?: boolean;
  heatmapDataUrl?: string | null;
  locationLabel?: string;
  onBboxChange?: (bbox: Wgs84Bbox) => void;
  className?: string;
};

const MAP_HEIGHT = "min(520px, 58vh)";

function bboxKey(b: Wgs84Bbox): string {
  return `${b.west.toFixed(5)}:${b.south.toFixed(5)}:${b.east.toFixed(5)}:${b.north.toFixed(5)}`;
}

function isSatelliteProvider(scene: TemporalScene): boolean {
  return (
    scene.provider === "landsat" ||
    scene.provider === "sentinel2" ||
    scene.provider === "cbers" ||
    scene.provider === "inpe"
  );
}

export function TemporalMapPanel({
  bbox,
  sceneA,
  sceneB,
  spectralIndex = "rgb",
  demoMode = true,
  splitPct = 50,
  showSplit = false,
  heatmapDataUrl,
  locationLabel,
  onBboxChange,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayARef = useRef<L.ImageOverlay | null>(null);
  const overlayBRef = useRef<L.ImageOverlay | null>(null);
  const tileARef = useRef<L.TileLayer | null>(null);
  const tileBRef = useRef<L.TileLayer | null>(null);
  const wmsARef = useRef<L.TileLayer.WMS | null>(null);
  const wmsBRef = useRef<L.TileLayer.WMS | null>(null);
  const heatRef = useRef<L.ImageOverlay | null>(null);
  const studyRectRef = useRef<L.Rectangle | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const photoTileCacheRef = useRef<Map<string, string>>(new Map());
  const contextLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const onBboxChangeRef = useRef(onBboxChange);
  const skipMoveEmitRef = useRef(false);
  const lastAppliedBboxKey = useRef<string>("");

  const [overlayKey, setOverlayKey] = useState(0);
  const [activeContextLayers, setActiveContextLayers] = useState<Set<string>>(
    () => new Set(),
  );

  onBboxChangeRef.current = onBboxChange;

  const photoMode = isPhotoSpectralIndex(spectralIndex);

  const toggleContextLayer = useCallback((id: string) => {
    setActiveContextLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const useRealTiles = useCallback(
    (scene: TemporalScene) =>
      Boolean(scene.tileUrl) ||
      (!demoMode && !scene.demo && scene.provider !== "srtm"),
    [demoMode],
  );

  const resolvePythonPreview = useCallback(
    async (scene: TemporalScene): Promise<string | null> => {
      const cacheKey = `py-${scene.id}-${scene.date}-${bboxKey(bbox)}-${spectralIndex}`;
      const cached = photoTileCacheRef.current.get(cacheKey);
      if (cached) return cached;

      try {
        const res = await fetch("/api/geo/temporal/landsat/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bbox,
            date: scene.date,
            sceneId: scene.id,
            stacItemUrl: scene.stacItemUrl,
            spectralMode: spectralIndex,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const json = (await res.json()) as {
          ok: boolean;
          previewProxyUrl?: string;
        };
        if (json.ok && json.previewProxyUrl) {
          photoTileCacheRef.current.set(cacheKey, json.previewProxyUrl);
          return json.previewProxyUrl;
        }
      } catch {
        /* engine offline — fallback TiTiler */
      }
      return null;
    },
    [bbox, spectralIndex],
  );

  const resolvePhotoTileUrl = useCallback(
    async (scene: TemporalScene): Promise<string | null> => {
      if (scene.tileUrl) return scene.tileUrl;

      const cacheKey = `${scene.date}-${bboxKey(bbox)}-${spectralIndex}`;
      const cached = photoTileCacheRef.current.get(cacheKey);
      if (cached) return cached;

      if (scene.provider === "landsat") {
        try {
          const forceMode =
            spectralIndex === "grayscale"
              ? "grayscale"
              : spectralIndex === "rgb"
                ? visualModeForDate(scene.date)
                : undefined;
          const resolved = await fetchLandsatSceneForDate({
            bbox,
            date: scene.date,
            visualMode: forceMode,
          });
          if (resolved?.tileUrl) {
            photoTileCacheRef.current.set(cacheKey, resolved.tileUrl);
            return resolved.tileUrl;
          }
        } catch {
          /* STAC indisponível */
        }
      }

      if (scene.provider === "sentinel2" && !scene.demo) {
        return null;
      }

      return ESRI_WORLD_IMAGERY;
    },
    [bbox, spectralIndex],
  );

  const resolveSceneUrl = useCallback(
    async (scene: TemporalScene | null): Promise<string | null> => {
      if (!scene) return null;
      if (photoMode && isSatelliteProvider(scene)) return null;
      if (scene.thumbnailUrl && useRealTiles(scene)) return scene.thumbnailUrl;

      const cacheKey = `${scene.id}-${scene.date}-${spectralIndex}-${bboxKey(bbox)}-${demoMode}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) return cached;

      if (useRealTiles(scene)) {
        try {
          const res = await fetch("/api/geo/temporal/tile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sceneId: scene.id,
              date: scene.date,
              index: spectralIndex,
              provider: scene.provider,
              bbox,
            }),
          });
          const json = (await res.json()) as {
            ok: boolean;
            dataUrl?: string;
          };
          if (json.ok && json.dataUrl) {
            cacheRef.current.set(cacheKey, json.dataUrl);
            return json.dataUrl;
          }
        } catch {
          /* fallback */
        }
      }

      const url = indexGridToDataUrl(scene.date, spectralIndex, bbox);
      if (url) cacheRef.current.set(cacheKey, url);
      return url || null;
    },
    [bbox, demoMode, photoMode, spectralIndex, useRealTiles],
  );

  const setBaseOpacity = useCallback((opacity: number) => {
    baseLayerRef.current?.setOpacity(opacity);
  }, []);

  const addPhotoTileLayer = useCallback(
    (map: L.Map, tileUrl: string, opacity: number): L.TileLayer => {
      const isTemplate = tileUrl.includes("{z}");
      const layer = L.tileLayer(tileUrl, {
        maxZoom: 20,
        maxNativeZoom: 19,
        opacity,
        pane: SCENE_MAP_PANE,
        attribution: isTemplate ? "© Esri" : "© USGS Landsat / TiTiler",
      });
      layer.addTo(map);
      return layer;
    },
    [],
  );

  const updateStudyRect = useCallback((map: L.Map, b: Wgs84Bbox, visible: boolean) => {
    if (!visible) {
      studyRectRef.current?.remove();
      studyRectRef.current = null;
      return;
    }
    const bounds: L.LatLngBoundsExpression = [
      [b.south, b.west],
      [b.north, b.east],
    ];
    if (studyRectRef.current) {
      studyRectRef.current.setBounds(bounds);
    } else {
      studyRectRef.current = L.rectangle(bounds, {
        color: "#ffffff",
        weight: 1,
        fillOpacity: 0,
        dashArray: "4 6",
        opacity: 0.45,
      }).addTo(map);
    }
  }, []);

  useEffect(() => {
    cacheRef.current.clear();
    photoTileCacheRef.current.clear();
    setOverlayKey((k) => k + 1);
  }, [spectralIndex, demoMode, bbox]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = {
      lat: (bbox.north + bbox.south) / 2,
      lng: (bbox.east + bbox.west) / 2,
    };
    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 13,
      zoomControl: true,
    });
    baseLayerRef.current = L.tileLayer(ESRI_WORLD_IMAGERY, {
      maxZoom: 20,
      attribution: "© Esri",
    }).addTo(map);
    ensureContextLayerPane(map);
    updateStudyRect(map, bbox, !photoMode);
    map.fitBounds([
      [bbox.south, bbox.west],
      [bbox.north, bbox.east],
    ]);
    lastAppliedBboxKey.current = bboxKey(bbox);

    map.on("moveend", () => {
      if (skipMoveEmitRef.current) {
        skipMoveEmitRef.current = false;
        return;
      }
      const c = map.getCenter();
      const next = bboxFromMapCenter(c.lat, c.lng);
      onBboxChangeRef.current?.(next);
    });

    mapRef.current = map;

    return () => {
      contextLayersRef.current.forEach((layer) => layer.remove());
      contextLayersRef.current.clear();
      studyRectRef.current = null;
      baseLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapa inicializado uma vez
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateStudyRect(map, bbox, !photoMode);
  }, [bbox, photoMode, updateStudyRect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = bboxKey(bbox);
    if (key === lastAppliedBboxKey.current) return;
    lastAppliedBboxKey.current = key;
    skipMoveEmitRef.current = true;
    map.fitBounds(
      [
        [bbox.south, bbox.west],
        [bbox.north, bbox.east],
      ],
      { animate: true, duration: 0.45 },
    );
  }, [bbox]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncMapContextLayers(map, activeContextLayers, contextLayersRef.current, L);
  }, [activeContextLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    const bounds: L.LatLngBoundsExpression = [
      [bbox.south, bbox.west],
      [bbox.north, bbox.east],
    ];

    overlayARef.current?.remove();
    overlayBRef.current?.remove();
    tileARef.current?.remove();
    tileBRef.current?.remove();
    wmsARef.current?.remove();
    wmsBRef.current?.remove();

    void (async () => {
      let hasPhotoA = false;

      if (sceneA) {
        if (photoMode && isSatelliteProvider(sceneA)) {
          const pyUrl = await resolvePythonPreview(sceneA);
          if (!cancelled && pyUrl) {
            overlayARef.current = L.imageOverlay(pyUrl, bounds, {
              opacity: 1,
              pane: SCENE_MAP_PANE,
            }).addTo(map);
            hasPhotoA = true;
          } else {
            const tileUrl = await resolvePhotoTileUrl(sceneA);
            if (!cancelled && tileUrl) {
              const isLandsatTile =
                tileUrl.includes("titiler") ||
                tileUrl.includes("planetarycomputer");
              tileARef.current = addPhotoTileLayer(map, tileUrl, 1);
              hasPhotoA = isLandsatTile;
            }
          }
        } else if (sceneA.wmsUrl && sceneA.wmsLayers && useRealTiles(sceneA)) {
          wmsARef.current = L.tileLayer
            .wms(sceneA.wmsUrl, {
              layers: sceneA.wmsLayers,
              format: "image/png",
              transparent: true,
              opacity: 0.85,
              pane: SCENE_MAP_PANE,
            })
            .addTo(map);
        } else {
          const url = await resolveSceneUrl(sceneA);
          if (!cancelled && url) {
            overlayARef.current = L.imageOverlay(url, bounds, {
              opacity: showSplit ? 1 : 0.82,
              pane: SCENE_MAP_PANE,
            }).addTo(map);
          }
        }
      }

      if (showSplit && sceneB) {
        if (photoMode && isSatelliteProvider(sceneB)) {
          const pyUrl = await resolvePythonPreview(sceneB);
          if (!cancelled && pyUrl) {
            overlayBRef.current = L.imageOverlay(pyUrl, bounds, {
              opacity: 1,
              pane: SCENE_MAP_PANE,
            }).addTo(map);
          } else {
            const tileUrl = await resolvePhotoTileUrl(sceneB);
            if (!cancelled && tileUrl) {
              tileBRef.current = addPhotoTileLayer(map, tileUrl, 1);
            }
          }
        } else if (sceneB.wmsUrl && sceneB.wmsLayers && useRealTiles(sceneB)) {
          wmsBRef.current = L.tileLayer
            .wms(sceneB.wmsUrl, {
              layers: sceneB.wmsLayers,
              format: "image/png",
              transparent: true,
              opacity: 0.82,
              pane: SCENE_MAP_PANE,
            })
            .addTo(map);
        } else {
          const url = await resolveSceneUrl(sceneB);
          if (!cancelled && url) {
            overlayBRef.current = L.imageOverlay(url, bounds, {
              opacity: 0.82,
              pane: SCENE_MAP_PANE,
            }).addTo(map);
          }
        }
      }

      if (!cancelled) {
        setBaseOpacity(hasPhotoA ? 0 : 1);
      }

      if (!cancelled && labelRef.current && sceneA) {
        const loc = locationLabel ? `${locationLabel} · ` : "";
        const era =
          photoMode && visualModeForDate(sceneA.date) === "grayscale"
            ? " · P&B histórico"
            : photoMode
              ? " · satélite"
              : "";
        labelRef.current.textContent = `${loc}${sceneA.date} · ${sceneA.satellite}${era}${showSplit && sceneB ? ` | ${sceneB.date}` : ""}`;
      }
    })();

    return () => {
      cancelled = true;
      setBaseOpacity(1);
    };
  }, [
    bbox,
    sceneA?.id,
    sceneA?.date,
    sceneA?.tileUrl,
    sceneB?.id,
    sceneB?.date,
    sceneB?.tileUrl,
    showSplit,
    resolveSceneUrl,
    resolvePhotoTileUrl,
    resolvePythonPreview,
    addPhotoTileLayer,
    overlayKey,
    demoMode,
    useRealTiles,
    spectralIndex,
    photoMode,
    locationLabel,
    setBaseOpacity,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    heatRef.current?.remove();
    if (heatmapDataUrl) {
      heatRef.current = L.imageOverlay(
        heatmapDataUrl,
        [
          [bbox.south, bbox.west],
          [bbox.north, bbox.east],
        ],
        { opacity: 0.65, pane: SCENE_MAP_PANE },
      ).addTo(map);
    }
  }, [bbox, heatmapDataUrl]);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[var(--border)] ${className}`}
    >
      <div ref={containerRef} className="w-full" style={{ height: MAP_HEIGHT }} />
      <div
        ref={labelRef}
        className="pointer-events-none absolute bottom-2 left-2 z-[500] max-w-[90%] rounded bg-black/65 px-2 py-1 text-[10px] text-white"
      />
      {onBboxChange && (
        <p className="pointer-events-none absolute right-2 top-2 z-[500] rounded bg-black/55 px-2 py-0.5 text-[9px] text-white/90">
          Timelapse 50 anos · estilo Google Earth
        </p>
      )}
      {showSplit && (
        <div
          className="pointer-events-none absolute inset-y-0 z-[500] w-0.5 bg-white shadow-lg"
          style={{ left: `${splitPct}%` }}
        />
      )}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-2">
        <GeoContextLayersToggle
          activeIds={activeContextLayers}
          onToggle={toggleContextLayer}
        />
      </div>
    </div>
  );
}

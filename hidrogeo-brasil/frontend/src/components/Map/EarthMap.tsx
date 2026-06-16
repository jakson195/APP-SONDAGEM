import { useEffect, useRef, useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import mapboxgl from "mapbox-gl";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import type { PickingInfo } from "@deck.gl/core";
import { useLayerStore } from "../../store/layerStore";
import { useMapToolsStore } from "../../store/mapToolsStore";
import { buildMapLayers } from "../../layers/buildLayers";
import { syncGeophysicsRasters } from "../../layers/syncGeophysicsRasters";
import { featureFromPick, featureFromApi, type FeatureInfo } from "../../types";
import {
  MAPBOX_BASEMAPS,
  MAPLIBRE_BASEMAPS,
  resolveMapboxToken,
  type BasemapId,
} from "../../lib/map-config";
import { getApiBase } from "../../lib/api-base";
import { getAnmLeilaoApiBase } from "../../lib/anm-leilao-api-base";
import {
  buildMiningSummary,
  layerIdFromDeckLayer,
  MINING_DECK_LAYER_PREFIXES,
  normalizeMvtMiningProps,
} from "../../lib/mining-feature";
import { STREAM_CATEGORY_IDS } from "../../layers/stream-categories";
import {
  applyFlatMapView,
} from "../../lib/view-mode";
import * as turf from "@turf/turf";
import type { MapCaptureApi } from "../../types/map-tools";
import { compositeMapCanvases } from "../../lib/map-capture";
import { isLeilaoANMModule } from "../../lib/leilao-module";

function resolveApiBase(): string {
  return isLeilaoANMModule() ? getAnmLeilaoApiBase() : getApiBase();
}
import { useLeilaoStore } from "../../store/leilaoStore";
import { notifyViewerReady } from "../../lib/viewer-ready";

type Props = {
  onFeatureSelect: (f: FeatureInfo | null) => void;
  onCursorMove: (lon: number, lat: number) => void;
};

function attachDeckOverlay(map: mapboxgl.Map | maplibregl.Map, engine: "mapbox" | "maplibre") {
  const overlay = new MapboxOverlay({
    interleaved: engine === "mapbox",
    layers: [],
  });
  map.addControl(overlay as never);
  return overlay;
}

type MapClickPoint = { x: number; y: number };

function initMapboxMap(
  container: HTMLDivElement,
  basemap: BasemapId,
  token: string,
  onCursorMove: (lon: number, lat: number) => void,
  onClick: (lon: number, lat: number, point: MapClickPoint) => void,
  onZoomEnd: (z: number) => void,
) {
  mapboxgl.accessToken = token;
  const map = new mapboxgl.Map({
    container,
    style: MAPBOX_BASEMAPS[basemap] ?? MAPBOX_BASEMAPS.satellite,
    center: [-54, -14],
    zoom: 3.5,
    pitch: 0,
    bearing: 0,
    antialias: true,
    preserveDrawingBuffer: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120 }), "bottom-left");

  map.on("load", () => {
    applyFlatMapView(map, false);
  });

  map.on("zoomend", () => onZoomEnd(map.getZoom()));
  map.on("mousemove", (e) => onCursorMove(e.lngLat.lng, e.lngLat.lat));
  map.on("click", (e) => onClick(e.lngLat.lng, e.lngLat.lat, e.point));

  return map;
}

function initMaplibreMap(
  container: HTMLDivElement,
  basemap: BasemapId,
  onCursorMove: (lon: number, lat: number) => void,
  onClick: (lon: number, lat: number, point: MapClickPoint) => void,
  onZoomEnd: (z: number) => void,
) {
  const map = new maplibregl.Map({
    container,
    style: MAPLIBRE_BASEMAPS[basemap] ?? MAPLIBRE_BASEMAPS.satellite,
    center: [-54, -14],
    zoom: 3.5,
    pitch: 0,
    bearing: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), "bottom-left");

  map.on("load", () => {
    applyFlatMapView(map, false);
  });

  map.on("zoomend", () => onZoomEnd(map.getZoom()));
  map.on("mousemove", (e) => onCursorMove(e.lngLat.lng, e.lngLat.lat));
  map.on("click", (e) => onClick(e.lngLat.lng, e.lngLat.lat, e.point));

  return map;
}

function isMiningLayerId(layerId: string): boolean {
  return (
    layerId.startsWith("mining_") ||
    layerId === "source_protection" ||
    MINING_DECK_LAYER_PREFIXES.some((p) => layerId.includes(p))
  );
}

function pushDeckLayers(
  overlay: MapboxOverlay,
  opts: Parameters<typeof buildMapLayers>[0],
) {
  try {
    const layers = buildMapLayers(opts);
    overlay.setProps({ layers } as MapboxOverlayProps);
  } catch (err) {
    console.error("HidroGeo camadas Deck:", err);
  }
}

export function EarthMap({ onFeatureSelect, onCursorMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | maplibregl.Map | null>(null);
  const engineRef = useRef<"mapbox" | "maplibre">("maplibre");
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const layerPickHandledRef = useRef(false);
  const zoomRef = useRef(3.5);
  const appliedBasemapRef = useRef<BasemapId | null>(null);
  const onCursorMoveRef = useRef(onCursorMove);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const [mapReady, setMapReady] = useState(false);

  onCursorMoveRef.current = onCursorMove;
  onFeatureSelectRef.current = onFeatureSelect;

  const { visible, opacity, basemap } = useLayerStore(
    useShallow((s) => ({
      visible: s.visible,
      opacity: s.opacity,
      basemap: s.basemap,
    })),
  );
  const {
    measureMode,
    measurePoints,
    exportPolygon,
    flowMonth,
    animateFlow,
    flowByBasin,
    flowDefault,
    flowLabel,
    addMeasurePoint,
    setExportPolygon,
    outletBasin,
    setOutletBasin,
    setOutletLoading,
    importedLayers,
    setMapCaptureApi,
  } = useMapToolsStore();
  const rodadaFilter = useLeilaoStore((s) => s.rodadas);
  const leilaoCategorias = useLeilaoStore((s) => s.categorias);
  const ufFilter = useLeilaoStore((s) => s.ufs);

  const enrichFlow = useCallback(
    (f: FeatureInfo): FeatureInfo => {
      if (!animateFlow || f.layer !== "rivers" || !f.basin) return f;
      const idx = flowByBasin[f.basin] ?? flowDefault;
      return { ...f, flow_index: idx, flow_month: flowLabel };
    },
    [animateFlow, flowByBasin, flowDefault, flowLabel],
  );

  const showFeature = useCallback(
    (layerId: string, raw: Record<string, unknown>) => {
      const f = featureFromApi(layerId, raw);
      if (isMiningLayerId(layerId)) {
        f.mining_summary = f.mining_summary ?? buildMiningSummary(f);
      }
      onFeatureSelectRef.current(enrichFlow(f));
    },
    [enrichFlow],
  );

  const resolvePick = useCallback(
    async (info: PickingInfo): Promise<boolean> => {
      const props = info.object?.properties as Record<string, unknown> | undefined;
      if (!props || !info.layer?.id) return false;

      const deckId = info.layer.id;
      const layerId = layerIdFromDeckLayer(deckId);
      if (!layerId) return false;

      const normalized =
        isMiningLayerId(layerId) ? normalizeMvtMiningProps({ ...props, id: props.id ?? info.index }) : props;

      const fid = Number(normalized.id);
      if (Number.isFinite(fid) && fid > 0) {
        try {
          const res = await fetch(`${resolveApiBase()}/layers/features/${layerId}/${fid}`);
          if (res.ok) {
            const data = (await res.json()) as Record<string, unknown>;
            showFeature(layerId, data);
            return true;
          }
        } catch {
          /* fallback MVT props */
        }
      }

      const picked = featureFromPick(deckId, normalized as Record<string, unknown>);
      if (isMiningLayerId(layerId)) {
        picked.mining_summary = picked.mining_summary ?? buildMiningSummary(picked);
      }
      onFeatureSelectRef.current(enrichFlow(picked));
      return true;
    },
    [enrichFlow, showFeature],
  );

  const handleMapClick = useCallback(
    async (lon: number, lat: number, point?: MapClickPoint) => {
      if (measureMode === "distance" || measureMode === "area") {
        addMeasurePoint(lon, lat);
        return;
      }
      if (measureMode === "export" || measureMode === "locationMap") {
        addMeasurePoint(lon, lat);
        const pts = [...measurePoints, [lon, lat] as [number, number]];
        setExportPolygon(pts);
        return;
      }

      if (measureMode === "outlet") {
        setOutletLoading(true);
        try {
          const res = await fetch(
            `${getApiBase()}/hydro/basin-by-outlet?lon=${lon}&lat=${lat}&snap=true`,
          );
          if (!res.ok) throw new Error("Falha ao calcular bacia");
          const data = (await res.json()) as import("../../types/outlet-basin").OutletBasinResult;
          setOutletBasin(data);
          if (data.found && data.basin) {
            onFeatureSelectRef.current({
              id: data.basin.id,
              layer: "basins",
              name: data.basin.name,
              code: data.basin.code,
              area_km2: data.basin.sub_area_km2 ?? data.basin.area_km2,
              type: data.basin.level === "region" ? "Região hidrográfica (nível 2)" : "Bacia hidrográfica (nível 4)",
              source: "HydroBASINS / HydroSHEDS",
              description: data.river?.name
                ? `Exutório no curso «${data.river.name}»${data.outlet.snapped ? " (ajustado ao rio)" : ""}.`
                : data.outlet.snapped
                  ? "Exutório ajustado ao curso d'água mais próximo."
                  : "Exutório no ponto clicado.",
            });
          } else {
            onFeatureSelectRef.current({
              id: 0,
              layer: "basins",
              name: "Bacia não encontrada",
              description: data.message ?? "Nenhuma bacia contém este ponto.",
              source: "HydroBASINS",
            });
          }
        } catch {
          onFeatureSelectRef.current({
            id: 0,
            layer: "basins",
            name: "Erro",
            description: "Não foi possível calcular a bacia. Verifique se a API e os dados HydroBASINS estão disponíveis.",
            source: "HidroGeo",
          });
        } finally {
          setOutletLoading(false);
        }
        return;
      }

      if (layerPickHandledRef.current) {
        layerPickHandledRef.current = false;
        return;
      }

      const overlay = overlayRef.current as (MapboxOverlay & {
        pickMultipleObjects?: (opts: { x: number; y: number; radius?: number }) => PickingInfo[];
      }) | null;

      if (overlay?.pickMultipleObjects && point) {
        const picks = overlay.pickMultipleObjects({ x: point.x, y: point.y, radius: 12 });
        for (const pick of picks) {
          const deckId = pick.layer?.id ?? "";
          if (MINING_DECK_LAYER_PREFIXES.some((p) => deckId.includes(p))) {
            if (await resolvePick(pick)) return;
          }
        }
      }

      const identifyLayers = isLeilaoANMModule()
        ? "mining_leilao_areas"
        : [
            visible.mining_processes && "mining_processes",
            visible.source_protection && "source_protection",
            visible.mining_blocks && "mining_blocks",
            visible.placer_reserves && "placer_reserves",
            visible.mining_leases && "mining_leases",
            visible.lithology && "lithology",
            visible.springs && "springs",
            ...STREAM_CATEGORY_IDS.filter((id) => visible[id]),
            visible.rivers && "rivers",
            visible.municipalities && "municipalities",
            visible.states && "states",
          ]
            .filter(Boolean)
            .join(",");

      if (!identifyLayers) {
        onFeatureSelectRef.current(null);
        return;
      }

      try {
        const res = await fetch(
          `${resolveApiBase()}/layers/features/identify?lon=${lon}&lat=${lat}&layers=${identifyLayers}`,
        );
        const data = (await res.json()) as {
          found: boolean;
          layer?: string;
          feature?: Record<string, unknown>;
          geology_summary?: string;
          mining_summary?: string;
        };
        if (data.found && data.layer && data.feature) {
          showFeature(data.layer, {
            ...data.feature,
            geology_summary: data.geology_summary ?? data.feature.geology_summary,
            mining_summary: data.mining_summary ?? data.feature.mining_summary,
          });
          return;
        }
      } catch {
        /* ignore */
      }
      onFeatureSelectRef.current(null);
    },
    [
      measureMode,
      measurePoints,
      addMeasurePoint,
      setExportPolygon,
      setOutletBasin,
      setOutletLoading,
      visible,
      resolvePick,
      showFeature,
    ],
  );

  const handleLayerClick = useCallback(
    (info: PickingInfo) => {
      if (measureMode !== "none") return;
      layerPickHandledRef.current = true;
      void resolvePick(info);
    },
    [measureMode, resolvePick],
  );

  const syncDeckLayers = useCallback(() => {
    const overlay = overlayRef.current;
    const map = mapRef.current;
    const leilaoModule = isLeilaoANMModule();
    if (map && !leilaoModule) syncGeophysicsRasters(map, visible, opacity);
    if (!overlay) return;
    pushDeckLayers(overlay, {
      visible,
      opacity,
      zoom: zoomRef.current,
      flowMonth,
      flowByBasin,
      flowDefault,
      animateFlow,
      measureMode,
      measurePoints,
      exportPolygon:
        measureMode === "export" || measureMode === "locationMap"
          ? exportPolygon.length >= 3
            ? exportPolygon
            : measurePoints
          : exportPolygon,
      outletBasin,
      leilaoModule: isLeilaoANMModule(),
      rodadaFilter,
      ufFilter,
      leilaoCategorias,
      importedLayers,
      onFeatureClick: handleLayerClick,
    });
  }, [
    visible,
    opacity,
    flowMonth,
    flowByBasin,
    flowDefault,
    animateFlow,
    measureMode,
    measurePoints,
    exportPolygon,
    outletBasin,
    rodadaFilter,
    ufFilter,
    leilaoCategorias,
    importedLayers,
    handleLayerClick,
  ]);

  const syncDeckLayersRef = useRef(syncDeckLayers);
  syncDeckLayersRef.current = syncDeckLayers;

  const handleMapClickRef = useRef(handleMapClick);
  handleMapClickRef.current = handleMapClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    const token = resolveMapboxToken();
    const engine: "mapbox" | "maplibre" = token ? "mapbox" : "maplibre";
    engineRef.current = engine;
    const initialBasemap = useLayerStore.getState().basemap as BasemapId;
    appliedBasemapRef.current = initialBasemap;

    const onZoomEnd = (z: number) => {
      zoomRef.current = z;
      syncDeckLayersRef.current();
    };

    const map =
      engine === "mapbox"
        ? initMapboxMap(
            containerRef.current,
            initialBasemap,
            token!,
            (lon, lat) => onCursorMoveRef.current(lon, lat),
            (lon, lat, point) => void handleMapClickRef.current(lon, lat, point),
            onZoomEnd,
          )
        : initMaplibreMap(
            containerRef.current,
            initialBasemap,
            (lon, lat) => onCursorMoveRef.current(lon, lat),
            (lon, lat, point) => void handleMapClickRef.current(lon, lat, point),
            onZoomEnd,
          );

    mapRef.current = map;

    if (isLeilaoANMModule()) {
      map.jumpTo({ center: [-44.5, -18.5], zoom: 6, pitch: 0, bearing: 0 });
      zoomRef.current = 6;
    }

    const onMapLoad = () => {
      if (cancelled) return;
      try {
        zoomRef.current = map.getZoom();
        overlayRef.current = attachDeckOverlay(map, engine);
        setMapReady(true);
        syncDeckLayersRef.current();
        notifyViewerReady();
      } catch (err) {
        console.error("HidroGeo Deck overlay:", err);
      }
    };

    if (map.loaded()) {
      onMapLoad();
    } else if (engine === "mapbox") {
      (map as mapboxgl.Map).once("load", onMapLoad);
    } else {
      (map as maplibregl.Map).once("load", onMapLoad);
    }

    return () => {
      cancelled = true;
      setMapReady(false);
      overlayRef.current = null;
      appliedBasemapRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const id = basemap as BasemapId;
    if (appliedBasemapRef.current === id) return;
    appliedBasemapRef.current = id;

    const engine = engineRef.current;

    if (engine === "mapbox") {
      const mb = map as mapboxgl.Map;
      mb.setStyle(MAPBOX_BASEMAPS[id] ?? MAPBOX_BASEMAPS.satellite);
      mb.once("style.load", () => {
        applyFlatMapView(mb, false);
        syncGeophysicsRasters(mb, useLayerStore.getState().visible, useLayerStore.getState().opacity);
        syncDeckLayersRef.current();
      });
      return;
    }

    const ml = map as maplibregl.Map;
    ml.setStyle(MAPLIBRE_BASEMAPS[id] ?? MAPLIBRE_BASEMAPS.satellite);
    ml.once("style.load", () => {
      applyFlatMapView(ml, false);
      syncGeophysicsRasters(ml, useLayerStore.getState().visible, useLayerStore.getState().opacity);
      syncDeckLayersRef.current();
    });
  }, [basemap, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const api: MapCaptureApi = {
      fitPolygon: async (ring, padding = 48) => {
        const poly = turf.polygon([ring]);
        const b = turf.bbox(poly);
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding, duration: 0, maxZoom: 16 },
        );
        await new Promise<void>((resolve) => {
          const once = (map as mapboxgl.Map & maplibregl.Map).once.bind(map);
          once("idle", () => resolve());
        });
      },
      waitForRender: async () => {
        const overlay = overlayRef.current as unknown as { _deck?: { redraw: () => void } } | null;
        overlay?._deck?.redraw();
        map.triggerRepaint?.();
        await new Promise<void>((resolve) => {
          const once = (map as mapboxgl.Map & maplibregl.Map).once.bind(map);
          once("idle", () => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
      },
      captureCanvas: () => {
        try {
          (overlayRef.current as unknown as { _deck?: { redraw: () => void } } | null)?._deck?.redraw();
          map.triggerRepaint?.();
          const composite = compositeMapCanvases(map.getContainer());
          if (composite) return composite;
          return map.getCanvas().toDataURL("image/png");
        } catch {
          return null;
        }
      },
      getCanvasSize: () => ({
        width: map.getCanvas().width,
        height: map.getCanvas().height,
      }),
      getBounds: () => {
        const b = map.getBounds();
        if (!b) {
          return { west: -180, south: -90, east: 180, north: 90 };
        }
        return {
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        };
      },
      getBearing: () => map.getBearing(),
      getCenter: () => {
        const c = map.getCenter();
        return { lon: c.lng, lat: c.lat };
      },
      getZoom: () => map.getZoom(),
    };

    setMapCaptureApi(api);
    return () => setMapCaptureApi(null);
  }, [mapReady, setMapCaptureApi]);

  useEffect(() => {
    if (!mapReady) return;
    syncDeckLayers();
  }, [mapReady, syncDeckLayers]);

  useEffect(() => {
    if (!mapReady) return;
    return useLayerStore.subscribe((state, prev) => {
      if (state.visible !== prev.visible || state.opacity !== prev.opacity) {
        syncDeckLayersRef.current();
      }
    });
  }, [mapReady]);

  return <div ref={containerRef} className="absolute inset-0 h-full min-h-[100vh] w-full" />;
}

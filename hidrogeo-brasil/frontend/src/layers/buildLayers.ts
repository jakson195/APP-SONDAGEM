import { MVTLayer } from "@deck.gl/geo-layers";
import { GeoJsonLayer, PathLayer, PolygonLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { strahlerColor, strahlerWidth, flowColor, springColor, applyStreamAlpha, streamCategoryColor, streamCategoryWidth, minTileZoomForStreamCategory } from "./hydrography";
import { STREAM_CATEGORY_IDS, STREAM_CATEGORY_META } from "./stream-categories";
import { lithologyColor } from "./lithology";
import {
  miningBlockColor,
  miningPhaseColor,
  placerReserveColor,
  sourceProtectionColor,
} from "./mining";
import { leilaoAreaFillColor, leilaoAreaLineColor } from "./leilao";
import { getAnmLeilaoTilesBase } from "../lib/anm-leilao-api-base";
import { getTilesBase } from "../lib/api-base";
import type { OutletBasinResult } from "../types/outlet-basin";
import type { ImportedMapLayer } from "../types/map-tools";

type ClickHandler = (info: PickingInfo) => void;

type AdminBoundaryOpts = {
  visible: Record<string, boolean>;
  opacity: Record<string, number>;
  measureMode: string;
};

/** Divisas IBGE — desenhadas por cima das camadas temáticas para ficarem visíveis. */
function buildAdminBoundaryLayers(
  tileBase: string,
  opts: AdminBoundaryOpts,
  onFeatureClick: ClickHandler,
  options?: { alwaysShow?: boolean },
): Layer[] {
  const layers: Layer[] = [];
  const pickable = opts.measureMode === "none";
  const showMunicipalities = options?.alwaysShow || opts.visible.municipalities;
  const showStates = options?.alwaysShow || opts.visible.states;

  if (showMunicipalities) {
    layers.push(
      new MVTLayer({
        id: "municipalities-mvt",
        data: `${tileBase}/public.municipalities/{z}/{x}/{y}.pbf`,
        pickable,
        filled: false,
        stroked: true,
        minZoom: 4,
        getLineColor: [248, 250, 252, Math.round(210 * (opts.opacity.municipalities ?? 0.85))],
        getLineWidth: 1.25,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        onClick: onFeatureClick,
        updateTriggers: { getLineColor: opts.opacity.municipalities },
      }),
    );
  }

  if (showStates) {
    layers.push(
      new MVTLayer({
        id: "states-mvt",
        data: `${tileBase}/public.states/{z}/{x}/{y}.pbf`,
        pickable,
        filled: false,
        stroked: true,
        minZoom: 3,
        getLineColor: [251, 191, 36, Math.round(245 * (opts.opacity.states ?? 0.95))],
        getLineWidth: 3,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 2,
        onClick: onFeatureClick,
        updateTriggers: { getLineColor: opts.opacity.states },
      }),
    );
  }

  return layers;
}

function buildLeilaoMapLayers(
  opts: Pick<
    Parameters<typeof buildMapLayers>[0],
    | "visible"
    | "opacity"
    | "measureMode"
    | "rodadaFilter"
    | "ufFilter"
    | "leilaoCategorias"
    | "onFeatureClick"
  >,
): Layer[] {
  const tileBase = getAnmLeilaoTilesBase();
  const layers: Layer[] = [];
  const layerOpacity = opts.opacity.mining_leilao_areas ?? 0.72;

  if (opts.visible.mining_leilao_areas) {
    layers.push(
      new MVTLayer({
        id: "mining-leilao-areas-mvt",
        data: `${tileBase}/public.mining_leilao_areas/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        highlightColor: [245, 158, 11, 200],
        filled: true,
        stroked: true,
        minZoom: 5,
        getFillColor: (f: { properties?: Record<string, unknown> }) =>
          leilaoAreaFillColor(f.properties, {
            layerOpacity,
            rodadaFilter: opts.rodadaFilter,
            ufFilter: opts.ufFilter,
            categorias: opts.leilaoCategorias,
          }),
        getLineColor: (f: { properties?: Record<string, unknown> }) =>
          leilaoAreaLineColor(f.properties, layerOpacity),
        getLineWidth: (f: { properties?: Record<string, unknown> }) =>
          String(f.properties?.leilao_categoria) === "prevista" ? 2.5 : 1.5,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
        updateTriggers: {
          getFillColor: [
            layerOpacity,
            opts.rodadaFilter,
            opts.ufFilter,
            opts.leilaoCategorias,
          ],
          getLineColor: [layerOpacity],
          getLineWidth: [opts.leilaoCategorias],
        },
      }),
    );
  }

  if (opts.visible.mining_leilao_upcoming) {
    layers.push(
      new MVTLayer({
        id: "mining-leilao-upcoming-mvt",
        data: `${tileBase}/public.mining_leilao_upcoming/{z}/{x}/{y}.pbf`,
        pickable: false,
        filled: false,
        stroked: true,
        minZoom: 5,
        getLineColor: [250, 204, 21, Math.round(220 * layerOpacity)],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
      }),
    );
  }

  layers.push(
    ...buildAdminBoundaryLayers(tileBase, opts, opts.onFeatureClick, { alwaysShow: true }),
  );

  return layers;
}

export function buildMapLayers(opts: {
  visible: Record<string, boolean>;
  opacity: Record<string, number>;
  zoom: number;
  flowMonth: number;
  flowByBasin: Record<string, number>;
  flowDefault: number;
  animateFlow: boolean;
  measureMode: string;
  measurePoints: [number, number][];
  exportPolygon: [number, number][];
  outletBasin: OutletBasinResult | null;
  leilaoModule?: boolean;
  rodadaFilter?: number[];
  ufFilter?: string[];
  leilaoCategorias?: import("./leilao").LeilaoCategoriaToggles;
  importedLayers: ImportedMapLayer[];
  onFeatureClick: ClickHandler;
}): Layer[] {
  if (opts.leilaoModule) {
    return buildLeilaoMapLayers(opts);
  }

  const layers: Layer[] = [];
  const tileBase = getTilesBase();

  if (opts.visible.lithology) {
    layers.push(
      new MVTLayer({
        id: "lithology-mvt",
        data: `${tileBase}/public.lithology/{z}/{x}/{y}.pbf`,
        pickable: true,
        autoHighlight: true,
        filled: true,
        stroked: true,
        getFillColor: (f: { properties?: Record<string, unknown> }) => {
          const rt = String(f.properties?.rock_type ?? "");
          const [r, g, b, a] = lithologyColor(rt);
          return [r, g, b, Math.round(a * (opts.opacity.lithology ?? 0.6))];
        },
        getLineColor: [255, 255, 255, 40],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
        updateTriggers: { getFillColor: opts.opacity.lithology },
      }),
    );
  }

  if (opts.visible.hydro_regions) {
    layers.push(
      new MVTLayer({
        id: "hydro-regions-mvt",
        data: `${tileBase}/public.hydro_regions/{z}/{x}/{y}.pbf`,
        pickable: false,
        filled: true,
        stroked: true,
        getFillColor: [34, 211, 238, Math.round(55 * (opts.opacity.hydro_regions ?? 0.35))],
        getLineColor: [34, 211, 238, Math.round(140 * (opts.opacity.hydro_regions ?? 0.35))],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
      }),
    );
  }

  if (opts.visible.basins) {
    layers.push(
      new MVTLayer({
        id: "basins-mvt",
        data: `${tileBase}/public.basins/{z}/{x}/{y}.pbf`,
        pickable: false,
        filled: true,
        stroked: true,
        getFillColor: [14, 165, 233, Math.round(45 * (opts.opacity.basins ?? 0.4))],
        getLineColor: [56, 189, 248, Math.round(160 * (opts.opacity.basins ?? 0.4))],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
      }),
    );
  }

  if (opts.visible.water_bodies) {
    layers.push(
      new MVTLayer({
        id: "water-bodies-mvt",
        data: `${tileBase}/public.water_bodies/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        filled: true,
        stroked: true,
        getFillColor: [59, 130, 246, Math.round(120 * (opts.opacity.water_bodies ?? 0.65))],
        getLineColor: [191, 219, 254, Math.round(200 * (opts.opacity.water_bodies ?? 0.65))],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
      }),
    );
  }

  for (const layerId of STREAM_CATEGORY_IDS) {
    if (!opts.visible[layerId]) continue;
    const meta = STREAM_CATEGORY_META[layerId];
    const cat = meta.category;
    const deckId = `${layerId.replace(/_/g, "-")}-mvt`;
    layers.push(
      new MVTLayer({
        id: deckId,
        data: `${tileBase}/public.${layerId}/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        minZoom: minTileZoomForStreamCategory(cat),
        maxZoom: 16,
        lineWidthMinPixels: 1,
        lineWidthUnits: "pixels",
        getLineColor: () => {
          const [r, g, b, a] = streamCategoryColor(cat);
          const faded = applyStreamAlpha([r, g, b, a], cat, opts.zoom);
          return [
            faded[0],
            faded[1],
            faded[2],
            Math.round(faded[3] * (opts.opacity[layerId] ?? 0.92)),
          ];
        },
        getLineWidth: () => streamCategoryWidth(cat, opts.zoom),
        onClick: opts.onFeatureClick,
        updateTriggers: {
          getLineColor: [opts.opacity[layerId], opts.zoom],
          getLineWidth: opts.zoom,
        },
      }),
    );
  }

  if (opts.visible.rivers) {
    layers.push(
      new MVTLayer({
        id: "rivers-mvt",
        data: `${tileBase}/public.rivers/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        minZoom: 4,
        maxZoom: 16,
        lineWidthMinPixels: 2,
        lineWidthUnits: "pixels",
        getLineColor: (f: { properties?: Record<string, unknown> }) => {
          if (opts.animateFlow) {
            const basin = String(f.properties?.basin ?? "");
            const factor =
              opts.flowByBasin[basin] ?? opts.flowByBasin[basin.split(" ")[0] ?? ""] ?? opts.flowDefault;
            const o = Number(f.properties?.strahler_order ?? 4);
            const [r, g, b, a] = flowColor(factor);
            return applyStreamAlpha(
              [r, g, b, Math.round(a * (opts.opacity.rivers ?? 0.95))],
              o,
              opts.zoom,
            );
          }
          const o = Number(f.properties?.strahler_order ?? 4);
          const [r, g, b, a] = strahlerColor(o);
          return applyStreamAlpha([r, g, b, a], o, opts.zoom);
        },
        getLineWidth: (f: { properties?: Record<string, unknown> }) => {
          const o = Number(f.properties?.strahler_order ?? 4);
          return strahlerWidth(o, opts.zoom);
        },
        onClick: opts.onFeatureClick,
        updateTriggers: {
          getLineColor: [opts.animateFlow, opts.flowMonth, opts.opacity.rivers, opts.zoom],
          getLineWidth: opts.zoom,
        },
      }),
    );
  }

  if (opts.visible.springs) {
    layers.push(
      new MVTLayer({
        id: "springs-mvt",
        data: `${tileBase}/public.springs/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        minZoom: 7,
        maxZoom: 16,
        pointType: "circle",
        getPointRadius: 5,
        pointRadiusUnits: "pixels",
        pointRadiusMinPixels: 3,
        getFillColor: () => {
          const [r, g, b, a] = springColor();
          return [r, g, b, Math.round(a * (opts.opacity.springs ?? 0.95))];
        },
        getLineColor: [255, 255, 255, 180],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
        updateTriggers: { getFillColor: opts.opacity.springs },
      }),
    );
  }

  // ANM leilão SOPLE — prioridade no módulo leilão
  if (opts.visible.mining_leilao_areas) {
    const layerOpacity = opts.opacity.mining_leilao_areas ?? 0.72;
    layers.push(
      new MVTLayer({
        id: "mining-leilao-areas-mvt",
        data: `${tileBase}/public.mining_leilao_areas/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        highlightColor: [245, 158, 11, 200],
        filled: true,
        stroked: true,
        minZoom: 5,
        getFillColor: (f: { properties?: Record<string, unknown> }) =>
          leilaoAreaFillColor(f.properties, {
            layerOpacity,
            rodadaFilter: opts.rodadaFilter,
            categorias: opts.leilaoCategorias,
          }),
        getLineColor: (f: { properties?: Record<string, unknown> }) =>
          leilaoAreaLineColor(f.properties, layerOpacity),
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
        updateTriggers: {
          getFillColor: [layerOpacity, opts.rodadaFilter, opts.leilaoCategorias],
        },
      }),
    );
  }

  // ANM por cima — clique prioriza mineração
  if (opts.visible.mining_processes) {
    layers.push(
      new MVTLayer({
        id: "mining-processes-mvt",
        data: `${tileBase}/public.mining_processes/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        highlightColor: [253, 224, 71, 180],
        filled: true,
        stroked: true,
        minZoom: 6,
        getFillColor: (f: { properties?: Record<string, unknown> }) => {
          const phase = String(f.properties?.phase ?? "");
          const [r, g, b, a] = miningPhaseColor(phase);
          return [r, g, b, Math.round(a * (opts.opacity.mining_processes ?? 0.65))];
        },
        getLineColor: [253, 224, 71, Math.round(200 * (opts.opacity.mining_processes ?? 0.65))],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
        updateTriggers: { getFillColor: opts.opacity.mining_processes },
      }),
    );
  }

  if (opts.visible.source_protection) {
    layers.push(
      new MVTLayer({
        id: "source-protection-mvt",
        data: `${tileBase}/public.source_protection/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        highlightColor: [34, 211, 238, 180],
        filled: true,
        stroked: true,
        minZoom: 5,
        getFillColor: () => {
          const [r, g, b, a] = sourceProtectionColor();
          return [r, g, b, Math.round(a * (opts.opacity.source_protection ?? 0.7))];
        },
        getLineColor: [34, 211, 238, Math.round(220 * (opts.opacity.source_protection ?? 0.7))],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
        updateTriggers: { getFillColor: opts.opacity.source_protection },
      }),
    );
  }

  if (opts.visible.mining_blocks) {
    layers.push(
      new MVTLayer({
        id: "mining-blocks-mvt",
        data: `${tileBase}/public.mining_blocks/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        filled: true,
        stroked: true,
        minZoom: 6,
        getFillColor: () => {
          const [r, g, b, a] = miningBlockColor();
          return [r, g, b, Math.round(a * (opts.opacity.mining_blocks ?? 0.6))];
        },
        getLineColor: [248, 113, 113, 200],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
      }),
    );
  }

  if (opts.visible.placer_reserves) {
    layers.push(
      new MVTLayer({
        id: "placer-reserves-mvt",
        data: `${tileBase}/public.placer_reserves/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        filled: true,
        stroked: true,
        minZoom: 6,
        getFillColor: () => {
          const [r, g, b, a] = placerReserveColor();
          return [r, g, b, Math.round(a * (opts.opacity.placer_reserves ?? 0.65))];
        },
        getLineColor: [252, 211, 77, 200],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
      }),
    );
  }

  if (opts.visible.mining_leases) {
    layers.push(
      new MVTLayer({
        id: "mining-leases-mvt",
        data: `${tileBase}/public.mining_leases/{z}/{x}/{y}.pbf`,
        pickable: opts.measureMode === "none",
        autoHighlight: true,
        filled: true,
        stroked: true,
        minZoom: 7,
        getFillColor: [168, 162, 158, Math.round(110 * (opts.opacity.mining_leases ?? 0.55))],
        getLineColor: [214, 211, 209, 180],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        onClick: opts.onFeatureClick,
      }),
    );
  }

  layers.push(...buildAdminBoundaryLayers(tileBase, opts, opts.onFeatureClick));

  if (opts.measurePoints.length >= 2 && opts.measureMode === "distance") {
    layers.push(
      new PathLayer({
        id: "measure-path",
        data: [{ path: opts.measurePoints }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [255, 220, 50, 220],
        getWidth: 3,
        widthUnits: "pixels",
      }),
    );
  }

  if (opts.measurePoints.length >= 3 && opts.measureMode === "area") {
    const ring = [...opts.measurePoints];
    if (ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1]) {
      ring.push(ring[0]!);
    }
    layers.push(
      new PolygonLayer({
        id: "measure-area",
        data: [{ polygon: [ring] }],
        getPolygon: (d: { polygon: [number, number][][] }) => d.polygon,
        getFillColor: [255, 200, 50, 60],
        getLineColor: [255, 220, 50, 220],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
      }),
    );
  }

  if (opts.exportPolygon.length >= 3) {
    const ring = [...opts.exportPolygon];
    if (ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1]) {
      ring.push(ring[0]!);
    }
    const isLocation = opts.measureMode === "locationMap";
    layers.push(
      new PolygonLayer({
        id: "export-bbox",
        data: [{ polygon: [ring] }],
        getPolygon: (d: { polygon: [number, number][][] }) => d.polygon,
        getFillColor: isLocation ? [255, 0, 0, 45] : [56, 189, 248, 40],
        getLineColor: isLocation ? [255, 0, 0, 255] : [56, 189, 248, 200],
        getLineWidth: isLocation ? 2 : 2,
        lineWidthUnits: "pixels",
      }),
    );
  }

  for (const imp of opts.importedLayers) {
    if (!imp.visible || !imp.data.features.length) continue;
    layers.push(
      new GeoJsonLayer({
        id: `import-${imp.id}`,
        data: imp.data,
        pickable: false,
        filled: true,
        stroked: true,
        getFillColor: [imp.color[0], imp.color[1], imp.color[2], 50],
        getLineColor: imp.color,
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        pointType: "circle",
        getPointRadius: 6,
        pointRadiusUnits: "pixels",
      }),
    );
  }

  if (opts.measurePoints.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: "measure-points",
        data: {
          type: "FeatureCollection",
          features: opts.measurePoints.map(([lon, lat], i) => ({
            type: "Feature",
            properties: { i },
            geometry: { type: "Point", coordinates: [lon, lat] },
          })),
        },
        pointType: "circle",
        getPointRadius: 6,
        pointRadiusUnits: "pixels",
        getFillColor: [255, 255, 255, 255],
        getLineColor: [255, 200, 50, 255],
        lineWidthUnits: "pixels",
        getLineWidth: 2,
      }),
    );
  }

  if (opts.outletBasin?.basin?.geometry) {
    layers.push(
      new GeoJsonLayer({
        id: "outlet-basin",
        data: {
          type: "Feature",
          properties: { name: opts.outletBasin.basin.name },
          geometry: opts.outletBasin.basin.geometry,
        },
        filled: true,
        stroked: true,
        getFillColor: [14, 165, 233, 75],
        getLineColor: [56, 189, 248, 240],
        getLineWidth: 3,
        lineWidthUnits: "pixels",
      }),
    );
  }

  if (opts.outletBasin?.outlet) {
    const { lon, lat, snapped } = opts.outletBasin.outlet;
    layers.push(
      new GeoJsonLayer({
        id: "outlet-point",
        data: {
          type: "Feature",
          properties: { snapped },
          geometry: { type: "Point", coordinates: [lon, lat] },
        },
        pointType: "circle",
        getPointRadius: 8,
        pointRadiusUnits: "pixels",
        getFillColor: snapped ? [248, 113, 113, 255] : [255, 255, 255, 255],
        getLineColor: [248, 113, 113, 255],
        lineWidthUnits: "pixels",
        getLineWidth: 2,
      }),
    );
  }

  return layers;
}

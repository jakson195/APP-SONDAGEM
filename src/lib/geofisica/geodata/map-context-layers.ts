import type L from "leaflet";
import {
  GEOSGB_MAP_OVERLAYS,
  arcgisMapServerTileUrl,
} from "./geosgb-catalog";

export const CONTEXT_MAP_PANE = "contextPane";

export type MapContextLayerGroup =
  | "geologia"
  | "hidrografia"
  | "topografia"
  | "geofisica";

export type MapContextLayerKind = "arcgis_tile" | "wms";

export type MapContextLayerDef = {
  id: string;
  label: string;
  group: MapContextLayerGroup;
  kind: MapContextLayerKind;
  /** URL MapServer base ou endpoint WMS. */
  url: string;
  wmsLayers?: string;
  opacity?: number;
  attribution?: string;
};

export const MAP_CONTEXT_LAYER_GROUPS: Record<
  MapContextLayerGroup,
  string
> = {
  geologia: "Geologia",
  hidrografia: "Hidrografia",
  topografia: "Topografia",
  geofisica: "Geofísica aérea",
};

/** Camadas de contexto — GeoSGB/CPRM (geologia), OpenTopography (topo preview). */
export const MAP_CONTEXT_LAYERS: MapContextLayerDef[] = [
  ...GEOSGB_MAP_OVERLAYS.map((o) => ({
    id: o.id,
    label: o.label,
    group:
      o.category === "estruturas"
        ? ("geologia" as const)
        : o.category === "gamaespectrometria"
          ? ("geofisica" as const)
          : ("geologia" as const),
    kind: "wms" as const,
    url: `${o.mapServerUrl.replace(/\/+$/, "")}/WMSServer`,
    wmsLayers: "0",
    opacity: o.opacity ?? 0.7,
    attribution: "© GeoSGB/CPRM",
  })),
  {
    id: "overlay-geomapa-wms",
    label: "Geomapa / litologia (WMS)",
    group: "geologia",
    kind: "wms",
    url: "https://geoportal.sgb.gov.br/server/services/geologia/geomapa/MapServer/WMSServer",
    wmsLayers: "0",
    opacity: 0.72,
    attribution: "© GeoSGB",
  },
  {
    id: "overlay-hidro-usgs",
    label: "Hidrografia / drenagem",
    group: "hidrografia",
    kind: "arcgis_tile",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer",
    opacity: 0.78,
    attribution: "© USGS",
  },
  {
    id: "overlay-hidro-esri",
    label: "Hidrografia (Esri ref.)",
    group: "hidrografia",
    kind: "arcgis_tile",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Hydro_Reference_Overlay/MapServer",
    opacity: 0.72,
    attribution: "© Esri",
  },
  {
    id: "overlay-topo-opentopo",
    label: "Elevação — Copernicus GLO-30 (via OT)",
    group: "topografia",
    kind: "arcgis_tile",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer",
    opacity: 0.55,
    attribution: "© OpenTopography / Copernicus DEM (preview hillshade)",
  },
  {
    id: "overlay-topo-shaded",
    label: "Topografia — relevo USGS (legado)",
    group: "topografia",
    kind: "arcgis_tile",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer",
    opacity: 0.45,
    attribution: "© USGS 3DEP",
  },
  {
    id: "overlay-topo-hillshade",
    label: "Topografia — hillshade Esri",
    group: "topografia",
    kind: "arcgis_tile",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer",
    opacity: 0.45,
    attribution: "© Esri",
  },
];

export function contextLayersByGroup(): Record<
  MapContextLayerGroup,
  MapContextLayerDef[]
> {
  const out: Record<MapContextLayerGroup, MapContextLayerDef[]> = {
    geologia: [],
    hidrografia: [],
    topografia: [],
    geofisica: [],
  };
  for (const layer of MAP_CONTEXT_LAYERS) {
    out[layer.group].push(layer);
  }
  return out;
}

/** Cria camada Leaflet a partir da definição. */
export function createMapContextLayer(
  L: typeof import("leaflet"),
  def: MapContextLayerDef,
  pane = CONTEXT_MAP_PANE,
): import("leaflet").Layer {
  const opacity = def.opacity ?? 0.7;
  if (def.kind === "wms") {
    return L.tileLayer.wms(def.url, {
      layers: def.wmsLayers ?? "0",
      format: "image/png",
      transparent: true,
      opacity,
      attribution: def.attribution ?? "",
      pane,
      version: "1.3.0",
      crs: L.CRS.EPSG3857,
      uppercase: true,
    });
  }
  return L.tileLayer(arcgisMapServerTileUrl(def.url), {
    maxZoom: 18,
    opacity,
    attribution: def.attribution ?? "",
    crossOrigin: "anonymous",
    pane,
    errorTileUrl:
      "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
  });
}

/** Painéis Leaflet: cena temporal abaixo, contexto geológico por cima. */
export function ensureContextLayerPane(map: import("leaflet").Map): void {
  if (!map.getPane("scenePane")) {
    map.createPane("scenePane");
    const scene = map.getPane("scenePane");
    if (scene) scene.style.zIndex = "400";
  }
  if (!map.getPane("contextPane")) {
    map.createPane("contextPane");
    const pane = map.getPane("contextPane");
    if (pane) pane.style.zIndex = "450";
  }
}

export const SCENE_MAP_PANE = "scenePane";

/** Sincroniza camadas activas no mapa Leaflet. */
export function syncMapContextLayers(
  map: import("leaflet").Map,
  activeIds: Set<string>,
  registry: Map<string, import("leaflet").Layer>,
  L: typeof import("leaflet"),
): void {
  ensureContextLayerPane(map);
  for (const def of MAP_CONTEXT_LAYERS) {
    const existing = registry.get(def.id);
    if (activeIds.has(def.id)) {
      if (!existing) {
        const layer = createMapContextLayer(L, def);
        layer.addTo(map);
        registry.set(def.id, layer);
      }
    } else if (existing) {
      map.removeLayer(existing);
      registry.delete(def.id);
    }
  }
}

export { GEOSGB_MAP_OVERLAYS, arcgisMapServerTileUrl };

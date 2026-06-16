import type { StyleSpecification } from "maplibre-gl";

export type BasemapId = "satellite" | "terrain" | "dark";

export const MAPBOX_BASEMAPS: Record<BasemapId, string> = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  terrain: "mapbox://styles/mapbox/outdoors-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
};

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const ESRI_TOPO =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";

function rasterStyle(
  sourceId: string,
  tiles: string[],
  attribution: string,
): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      [sourceId]: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution,
        maxzoom: 19,
      },
    },
    layers: [{ id: `${sourceId}-layer`, type: "raster", source: sourceId }],
  };
}

export const MAPLIBRE_BASEMAPS: Record<BasemapId, StyleSpecification | string> = {
  satellite: rasterStyle(
    "esri-imagery",
    [ESRI_IMAGERY],
    "Esri, Maxar, Earthstar Geographics",
  ),
  terrain: rasterStyle("esri-topo", [ESRI_TOPO], "Esri, OpenStreetMap contributors"),
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

function validMapboxToken(token: string | undefined): string | undefined {
  const t = token?.trim();
  if (!t || !t.startsWith("pk.") || t.length < 20) return undefined;
  return t;
}

export function resolveMapboxToken(): string | undefined {
  const fromEnv = validMapboxToken(import.meta.env.VITE_MAPBOX_TOKEN);
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return undefined;
  const fromUrl = validMapboxToken(
    new URLSearchParams(window.location.search).get("mapboxToken") ?? undefined,
  );
  return fromUrl;
}

export function usesMapboxEngine(): boolean {
  return Boolean(resolveMapboxToken());
}

export function basemapLabel(id: BasemapId, engine: "mapbox" | "maplibre"): string {
  if (id === "satellite") {
    return engine === "mapbox" ? "Satélite (Mapbox)" : "Satélite (Esri)";
  }
  if (id === "terrain") return "Terreno";
  return "Escuro";
}

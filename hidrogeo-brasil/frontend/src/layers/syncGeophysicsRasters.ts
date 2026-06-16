import type { Map as MbxMap } from "mapbox-gl";
import type maplibregl from "maplibre-gl";
import { GEOPHYSICS_RASTER_LAYERS } from "./geophysics-raster";

type AnyMap = MbxMap | maplibregl.Map;

function asMbx(map: AnyMap): MbxMap {
  return map as MbxMap;
}

function mapHasSource(map: AnyMap, id: string): boolean {
  return Boolean(asMbx(map).getSource(id));
}

function mapHasLayer(map: AnyMap, id: string): boolean {
  return Boolean(asMbx(map).getLayer(id));
}

function rasterBeforeId(map: AnyMap): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers?.length) return undefined;
  const symbol = layers.find(
    (l) => l.type === "symbol" && (l.layout as Record<string, unknown> | undefined)?.["text-field"],
  );
  return symbol?.id;
}

function ensureRaster(
  map: AnyMap,
  def: (typeof GEOPHYSICS_RASTER_LAYERS)[number],
  opacity: number,
): void {
  const m = asMbx(map);

  if (!mapHasSource(map, def.sourceId)) {
    m.addSource(def.sourceId, {
      type: "raster",
      tiles: def.tiles,
      tileSize: 256,
      minzoom: def.tileMinZoom,
      maxzoom: def.tileMaxZoom,
      attribution: def.attribution,
    });
  }

  const paint = {
    "raster-opacity": opacity,
    "raster-fade-duration": 0,
    "raster-resampling": "linear" as const,
  };

  if (!mapHasLayer(map, def.layerId)) {
    const before = rasterBeforeId(map);
    m.addLayer(
      {
        id: def.layerId,
        type: "raster",
        source: def.sourceId,
        minzoom: def.layerMinZoom,
        maxzoom: def.layerMaxZoom,
        paint,
      },
      before,
    );
    return;
  }

  m.setLayerZoomRange(def.layerId, def.layerMinZoom, def.layerMaxZoom);
  m.setPaintProperty(def.layerId, "raster-opacity", opacity);
  m.setPaintProperty(def.layerId, "raster-resampling", "linear");
}

function removeRaster(map: AnyMap, def: (typeof GEOPHYSICS_RASTER_LAYERS)[number]): void {
  if (mapHasLayer(map, def.layerId)) asMbx(map).removeLayer(def.layerId);
  if (mapHasSource(map, def.sourceId)) asMbx(map).removeSource(def.sourceId);
}

/** Sincroniza overlays raster de geofísica (magnetometria CPRM) no mapa base. */
export function syncGeophysicsRasters(
  map: AnyMap | null,
  visible: Record<string, boolean>,
  opacity: Record<string, number>,
): void {
  if (!map || !map.isStyleLoaded()) return;

  for (const def of GEOPHYSICS_RASTER_LAYERS) {
    const on = visible[def.catalogId] ?? false;
    if (on) {
      ensureRaster(map, def, opacity[def.catalogId] ?? 0.72);
    } else {
      removeRaster(map, def);
    }
  }
}

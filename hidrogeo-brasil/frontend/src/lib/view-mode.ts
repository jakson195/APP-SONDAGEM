import type { Map as MapboxMap } from "mapbox-gl";
import type { Map as MaplibreMap } from "maplibre-gl";

/** Garante vista 2D plana (sem inclinação nem relevo 3D). */
export function applyFlatMapView(map: MapboxMap | MaplibreMap, animate = false): void {
  map.easeTo({
    pitch: 0,
    bearing: 0,
    duration: animate ? 400 : 0,
  });

  if ("setTerrain" in map && typeof map.setTerrain === "function") {
    (map as MapboxMap).setTerrain(null);
  }
  if ("setFog" in map && typeof map.setFog === "function") {
    (map as MapboxMap).setFog({ "horizon-blend": 0, "star-intensity": 0 });
  }
}

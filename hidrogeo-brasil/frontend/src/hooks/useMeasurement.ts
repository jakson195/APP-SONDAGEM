import * as turf from "@turf/turf";
import { useCallback } from "react";
import { useMapToolsStore } from "../store/mapToolsStore";

export function useMeasurement() {
  const { measurePoints, measureMode, setMeasureLabel } = useMapToolsStore();

  const compute = useCallback(() => {
    if (measurePoints.length < 2) {
      setMeasureLabel(null);
      return;
    }
    if (measureMode === "distance") {
      const line = turf.lineString(measurePoints);
      const km = turf.length(line, { units: "kilometers" });
      setMeasureLabel(`${km.toFixed(2)} km`);
      return;
    }
    if (measureMode === "area" && measurePoints.length >= 3) {
      const ring = [...measurePoints];
      if (ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1]) {
        ring.push(ring[0]!);
      }
      const poly = turf.polygon([ring]);
      const km2 = turf.area(poly) / 1_000_000;
      setMeasureLabel(`${km2.toFixed(2)} km²`);
    }
  }, [measurePoints, measureMode, setMeasureLabel]);

  return { compute };
}

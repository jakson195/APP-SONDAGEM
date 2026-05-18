import { useEffect, useRef } from "react";

import { fetchLatestPrediction } from "../api/predictions";
import { useCesium } from "../context/CesiumContext";

export function usePredictionLayers(projectId: string | null, enabled: boolean) {
  const { layerManager, ready } = useCesium();
  const layerId = useRef<string | null>(null);

  const refresh = async () => {
    if (!layerManager || !projectId || !enabled) return;
    if (layerId.current) {
      await layerManager.remove(layerId.current);
      layerId.current = null;
    }
    try {
      const detail = await fetchLatestPrediction(projectId);
      if (!detail.probability_map?.features?.length) return;
      layerId.current = await layerManager.addGeoJson({
        name: "Mapa probabilidade (IA)",
        data: detail.probability_map,
      });
    } catch {
      /* sem previsão ainda */
    }
  };

  useEffect(() => {
    if (!ready || !layerManager) return;
    void refresh();
    return () => {
      if (layerId.current && layerManager) {
        void layerManager.remove(layerId.current);
      }
    };
  }, [projectId, ready, layerManager, enabled]);

  return { refreshPredictionMap: refresh };
}

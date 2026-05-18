import { useEffect, useRef } from "react";

import {
  alertsToGeoJSON,
  fetchCriticalAreasGeoJSON,
  fetchProjectAlerts,
} from "../api/alerts";
import { useCesium } from "../context/CesiumContext";

/** Camadas Cesium: alertas abertos e áreas críticas. */
export function useGeotechAlertLayers(projectId: string | null, enabled = true) {
  const { layerManager, ready } = useCesium();
  const alertsLayerId = useRef<string | null>(null);
  const areasLayerId = useRef<string | null>(null);

  const refresh = async () => {
    if (!layerManager || !projectId || !enabled) return;

    if (alertsLayerId.current) {
      await layerManager.remove(alertsLayerId.current);
      alertsLayerId.current = null;
    }
    if (areasLayerId.current) {
      await layerManager.remove(areasLayerId.current);
      areasLayerId.current = null;
    }

    try {
      const [alertsRes, areasFc] = await Promise.all([
        fetchProjectAlerts(projectId, { status: "open" }),
        fetchCriticalAreasGeoJSON(projectId),
      ]);

      const alertFc = alertsToGeoJSON(alertsRes.items);
      if (alertFc.features.length > 0) {
        alertsLayerId.current = await layerManager.addGeoJson({
          name: "Alertas geotécnicos",
          data: alertFc,
        });
      }

      if (areasFc.features.length > 0) {
        areasLayerId.current = await layerManager.addGeoJson({
          name: "Áreas críticas",
          data: areasFc,
        });
      }
    } catch {
      /* API indisponível ou sem dados */
    }
  };

  useEffect(() => {
    if (!ready || !layerManager || !projectId || !enabled) return;
    void refresh();
    return () => {
      void (async () => {
        if (alertsLayerId.current) await layerManager.remove(alertsLayerId.current);
        if (areasLayerId.current) await layerManager.remove(areasLayerId.current);
      })();
    };
  }, [projectId, ready, layerManager, enabled]);

  return { refreshLayers: refresh };
}

import { useEffect, useRef } from "react";

import {
  deformationsToGeoJSON,
  fetchDeformations,
} from "../api/client";
import type { ProjectSummary } from "../api/types";
import { flyToPosition } from "../cesium/flyTo";
import { useCesium } from "../context/CesiumContext";

/** Carrega limite do projeto e deformações InSAR como camadas GeoJSON. */
export function useProjectLayers(project: ProjectSummary | null) {
  const { viewer, layerManager, ready } = useCesium();
  const boundaryId = useRef<string | null>(null);
  const deformId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !layerManager || !project) return;

    let cancelled = false;

    void (async () => {
      if (boundaryId.current) {
        await layerManager.remove(boundaryId.current);
        boundaryId.current = null;
      }
      if (deformId.current) {
        await layerManager.remove(deformId.current);
        deformId.current = null;
      }
      if (cancelled) return;

      if (project.boundary) {
        boundaryId.current = await layerManager.addGeoJson({
          name: `Limite: ${project.code}`,
          data: {
            type: "Feature",
            properties: { role: "boundary" },
            geometry: project.boundary,
          },
          flyTo: true,
        });
      } else if (project.center?.type === "Point" && viewer) {
        const [lon, lat] = project.center.coordinates;
        flyToPosition(viewer, { longitude: lon, latitude: lat, height: 12000 });
      }

      try {
        const data = await fetchDeformations(project.id, { limit: 8000 });
        if (cancelled || data.items.length === 0) return;
        deformId.current = await layerManager.addGeoJson({
          name: "Deformações InSAR",
          data: deformationsToGeoJSON(data.items),
        });
      } catch {
        /* API sem dados ainda */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project, ready, layerManager, viewer]);

  useEffect(() => {
    return () => {
      if (!layerManager) return;
      void (async () => {
        if (boundaryId.current) await layerManager.remove(boundaryId.current);
        if (deformId.current) await layerManager.remove(deformId.current);
      })();
    };
  }, [layerManager]);
}

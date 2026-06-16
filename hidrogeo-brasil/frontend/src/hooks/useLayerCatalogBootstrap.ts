import { useEffect } from "react";
import { getApiBase } from "../lib/api-base";
import { collectLayerDefaults, filterLayerGroupsForApp, mergeLayerGroups } from "../layers/layerCatalog";
import { HIDROGEO_VISIBLE_DEFAULTS, useLayerStore } from "../store/layerStore";
import type { LayerGroup } from "../types";

function applyCatalog(groups: LayerGroup[]) {
  const merged = filterLayerGroupsForApp(mergeLayerGroups(groups));
  const { ids, defaults } = collectLayerDefaults(merged);
  const applyHidroGeoCatalog = useLayerStore.getState().applyHidroGeoCatalog;
  const initLayers = useLayerStore.getState().initLayers;
  applyHidroGeoCatalog(defaults);
  initLayers(ids, defaults);
}

/** Inicializa catálogo HidroGeo (não usado no viewer ANM leilão). */
export function useLayerCatalogBootstrap() {
  useEffect(() => {
    useLayerStore.getState().applyHidroGeoCatalog(HIDROGEO_VISIBLE_DEFAULTS);

    fetch(`${getApiBase()}/layers`)
      .then((r) => r.json())
      .then((data: { groups: LayerGroup[] }) => {
        applyCatalog(data.groups ?? []);
      })
      .catch(() => {
        applyCatalog([]);
      });
  }, []);
}

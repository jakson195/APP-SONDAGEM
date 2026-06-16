import {
  IonImageryProvider,
  UrlTemplateImageryProvider,
  Viewer,
  createWorldImageryAsync,
} from "cesium";

import { hasIonToken } from "./initIon";

/** Camada base satélite (Ion Bing Aerial ou Esri World Imagery). */
export async function applySatelliteBaseImagery(viewer: Viewer): Promise<void> {
  const layers = viewer.imageryLayers;
  layers.removeAll();

  if (hasIonToken()) {
    try {
      const ionSat = await IonImageryProvider.fromAssetId(2);
      layers.addImageryProvider(ionSat);
      return;
    } catch {
      /* fallback */
    }
    try {
      const world = await createWorldImageryAsync();
      layers.addImageryProvider(world);
      return;
    } catch {
      /* fallback */
    }
  }

  layers.addImageryProvider(
    new UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "Esri, Maxar, Earthstar Geographics",
    }),
  );
}

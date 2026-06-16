import {
  Color,
  Viewer,
  createWorldTerrainAsync,
  type CesiumTerrainProvider,
} from "cesium";

import { applySatelliteBaseImagery } from "./imagery";
import { configureCesiumIon } from "./initIon";

export interface CreateViewerOptions {
  /** Desativa widgets nativos — usamos timeline e layers próprios */
  useBuiltinTimeline?: boolean;
}

export async function createCesiumViewer(
  container: HTMLElement,
  options: CreateViewerOptions = {},
): Promise<Viewer> {
  configureCesiumIon();

  let terrain: CesiumTerrainProvider | undefined;
  try {
    terrain = await createWorldTerrainAsync();
  } catch {
    terrain = undefined;
  }

  const viewer = new Viewer(container, {
    terrainProvider: terrain,
    animation: false,
    timeline: options.useBuiltinTimeline ?? false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: true,
    navigationHelpButton: false,
    fullscreenButton: true,
    baseLayer: false,
    infoBox: true,
    selectionIndicator: true,
  });

  viewer.scene.globe.baseColor = Color.fromCssColorString("#0f172a");
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.fog.enabled = true;

  await applySatelliteBaseImagery(viewer);

  return viewer;
}

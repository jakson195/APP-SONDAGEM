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
  /**
   * `insar_pro`: chrome próprio (fullscreen HUD); usa sempre terrain mundo + imagem satélite.
   */
  chrome?: "default" | "insar_pro";
  /** Sem terrain Ion (arranque mais rápido, ex. pré-visualização AOI na ficha da obra). */
  lightweight?: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export async function createCesiumViewer(
  container: HTMLElement,
  options: CreateViewerOptions = {},
): Promise<Viewer> {
  configureCesiumIon();

  const proChrome = options.chrome === "insar_pro";

  let terrain: CesiumTerrainProvider | undefined;
  if (!options.lightweight) {
    try {
      terrain = await withTimeout(createWorldTerrainAsync(), 12_000);
    } catch {
      terrain = undefined;
    }
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
    fullscreenButton: !proChrome,
    baseLayer: false,
    infoBox: true,
    selectionIndicator: true,
  });

  viewer.scene.globe.baseColor = Color.fromCssColorString("#0f172a");
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.fog.enabled = true;

  try {
    await withTimeout(applySatelliteBaseImagery(viewer), 12_000);
  } catch {
    /* globo sem imagem base se rede/Ion falhar */
  }

  return viewer;
}

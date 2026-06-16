import {
  Cesium3DTileset,
  Cesium3DTileStyle,
  Color,
  ColorMaterialProperty,
  GeoJsonDataSource,
  IonResource,
  Rectangle,
  SingleTileImageryProvider,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  type ImageryLayer,
  type Viewer,
} from "cesium";

import {
  DEFAULT_DEFORMATION_THRESHOLDS,
  type DeformationThresholds,
} from "./insar/colormap";
import {
  applyDiffColormap,
  computeDeltaRaster,
} from "./insar/diffColormap";
import {
  fetchGeotiffBuffer,
  loadGeotiffOverlay,
  recolorGeotiffCanvas,
} from "./insar/geotiffLoader";
import { flyToDataSource, flyToTileset } from "./flyTo";
import type {
  Add3DTilesOptions,
  AddGeoJsonOptions,
  AddInsarGeotiffOptions,
  AddRasterOptions,
  LayerKind,
  LayerRecord,
  TemporalRange,
} from "./types";

type InsarCache = {
  values: Float32Array;
  width: number;
  height: number;
  nodata: number | null;
  rectangle: [number, number, number, number];
  epochDate: string | null;
  rasterKind: string;
  thresholds: DeformationThresholds;
  blobUrl: string;
};

type InternalLayer = LayerRecord & {
  dataSource?: GeoJsonDataSource;
  tileset?: Cesium3DTileset;
  imageryLayer?: ImageryLayer;
  insarCache?: InsarCache;
};

function newId(): string {
  return crypto.randomUUID();
}

function inTemporalRange(date: string | null, range?: TemporalRange): boolean {
  if (!date || !range) return true;
  if (range.epochFrom && date < range.epochFrom) return false;
  if (range.epochTo && date > range.epochTo) return false;
  return true;
}

export class LayerManager {
  private readonly viewer: Viewer;
  private readonly map = new Map<string, InternalLayer>();
  private listeners = new Set<() => void>();
  private currentEpoch: string | null = null;
  private insarThresholds: DeformationThresholds = { ...DEFAULT_DEFORMATION_THRESHOLDS };
  private insarOpacity = 0.78;
  private playbackDateSet: Set<string> | null = null;
  private compareMode: { epochA: string; epochB: string } | null = null;
  private compareDiffLayerId: string | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  list(): LayerRecord[] {
    return [...this.map.values()].map(
      ({ dataSource: _d, tileset: _t, imageryLayer: _i, ...rest }) => rest,
    );
  }

  setCurrentEpoch(isoDate: string | null): void {
    this.currentEpoch = isoDate;
    if (isoDate) this.compareMode = null;
    this.applyTemporalFilter();
  }

  setPlaybackDates(dates: string[] | null): void {
    this.playbackDateSet = dates?.length ? new Set(dates) : null;
    this.notify();
  }

  getPlaybackDates(): string[] | null {
    return this.playbackDateSet ? [...this.playbackDateSet].sort() : null;
  }

  getInsarDisplacementEpochs(): string[] {
    const epochs = new Set<string>();
    for (const layer of this.map.values()) {
      if (
        layer.kind === "insar" &&
        layer.insarCache?.rasterKind === "displacement" &&
        layer.insarCache.epochDate
      ) {
        epochs.add(layer.insarCache.epochDate);
      }
    }
    return [...epochs].sort();
  }

  async setComparePeriods(
    epochA: string | null,
    epochB: string | null,
  ): Promise<void> {
    if (this.compareDiffLayerId) {
      await this.remove(this.compareDiffLayerId);
      this.compareDiffLayerId = null;
    }
    if (epochA && epochB && epochA !== epochB) {
      this.compareMode = { epochA, epochB };
      this.currentEpoch = null;
      await this.buildCompareDiffLayer(epochA, epochB);
    } else {
      this.compareMode = null;
    }
    this.applyTemporalFilter();
    this.notify();
  }

  clearCompare(): void {
    void this.setComparePeriods(null, null);
  }

  isCompareMode(): boolean {
    return this.compareMode != null;
  }

  private async buildCompareDiffLayer(epochA: string, epochB: string): Promise<void> {
    let layerA: InternalLayer | undefined;
    let layerB: InternalLayer | undefined;
    for (const layer of this.map.values()) {
      if (layer.kind !== "insar" || !layer.insarCache) continue;
      if (
        layer.insarCache.rasterKind === "displacement" &&
        layer.insarCache.epochDate === epochA
      ) {
        layerA = layer;
      }
      if (
        layer.insarCache.rasterKind === "displacement" &&
        layer.insarCache.epochDate === epochB
      ) {
        layerB = layer;
      }
    }
    if (!layerA?.insarCache || !layerB?.insarCache) return;
    const ca = layerA.insarCache;
    const cb = layerB.insarCache;
    if (ca.width !== cb.width || ca.height !== cb.height) return;

    const delta = computeDeltaRaster(ca.values, cb.values, ca.nodata);
    const imageData = applyDiffColormap(
      delta,
      ca.width,
      ca.height,
      ca.nodata,
    );
    const canvas = document.createElement("canvas");
    canvas.width = ca.width;
    canvas.height = ca.height;
    canvas.getContext("2d")!.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png");
    });
    const blobUrl = URL.createObjectURL(blob);
    const imageryLayer = this._attachInsarImagery(
      blobUrl,
      ca.rectangle,
      this.insarOpacity,
    );
    const id = newId();
    this.map.set(id, {
      id,
      name: `Δ ${epochA} → ${epochB}`,
      kind: "insar",
      visible: true,
      opacity: this.insarOpacity,
      source: "compare-diff",
      imageryLayer,
      insarCache: {
        values: delta,
        width: ca.width,
        height: ca.height,
        nodata: ca.nodata,
        rectangle: ca.rectangle,
        epochDate: null,
        rasterKind: "diff",
        thresholds: this.insarThresholds,
        blobUrl,
      },
    });
    this.compareDiffLayerId = id;
  }

  private applyTemporalFilter(): void {
    const date = this.currentEpoch;
    const cmp = this.compareMode;

    for (const layer of this.map.values()) {
      const layerOk = inTemporalRange(date, layer.temporal);
      let visible = layer.visible && layerOk;

      if (layer.dataSource) {
        layer.dataSource.show = visible;
        if (date && !cmp) {
          for (const entity of layer.dataSource.entities.values) {
            const ep = entity.properties?.epoch_date?.getValue() as
              | string
              | undefined;
            entity.show = visible && (!ep || ep === date);
          }
        }
      }
      if (layer.tileset) layer.tileset.show = visible;

      if (layer.imageryLayer && layer.kind === "insar" && layer.insarCache) {
        const kind = layer.insarCache.rasterKind;
        const ep = layer.insarCache.epochDate;

        if (kind === "diff") {
          layer.imageryLayer.show = visible && cmp != null;
          continue;
        }

        if (cmp && kind === "displacement" && ep) {
          const showA = ep === cmp.epochA;
          const showB = ep === cmp.epochB;
          layer.imageryLayer.show = visible && (showA || showB);
          layer.imageryLayer.alpha = showB ? this.insarOpacity * 0.55 : this.insarOpacity;
          continue;
        }

        if (kind === "velocity") {
          layer.imageryLayer.show = visible && !cmp && !date;
          continue;
        }

        if (kind === "displacement" && date) {
          const inSet =
            !this.playbackDateSet || (ep != null && this.playbackDateSet.has(ep));
          layer.imageryLayer.show = visible && inSet && ep === date;
          layer.imageryLayer.alpha = layer.opacity;
        } else if (kind === "displacement" && !date && !cmp) {
          layer.imageryLayer.show = visible;
        }
      } else if (layer.imageryLayer) {
        layer.imageryLayer.show = visible;
      }
    }
    this.notify();
  }

  getInsarThresholds(): DeformationThresholds {
    return { ...this.insarThresholds };
  }

  async setInsarThresholds(thresholds: DeformationThresholds): Promise<void> {
    this.insarThresholds = { ...thresholds };
    const ids = [...this.map.entries()]
      .filter(([, l]) => l.kind === "insar" && l.insarCache)
      .map(([id]) => id);
    for (const id of ids) {
      await this.refreshInsarLayer(id);
    }
    this.notify();
  }

  setInsarGlobalOpacity(opacity: number): void {
    this.insarOpacity = opacity;
    for (const layer of this.map.values()) {
      if (layer.kind === "insar" && layer.imageryLayer) {
        layer.opacity = opacity;
        layer.imageryLayer.alpha = opacity;
      }
    }
    this.notify();
  }

  getInsarGlobalOpacity(): number {
    return this.insarOpacity;
  }

  listInsarLayers(): LayerRecord[] {
    return this.list().filter((l) => l.kind === "insar");
  }

  setVisible(id: string, visible: boolean): void {
    const layer = this.map.get(id);
    if (!layer) return;
    layer.visible = visible;
    this.applyTemporalFilter();
  }

  setOpacity(id: string, opacity: number): void {
    const layer = this.map.get(id);
    if (!layer) return;
    layer.opacity = opacity;
    if (layer.imageryLayer) layer.imageryLayer.alpha = opacity;
    if (layer.dataSource) {
      const entities = layer.dataSource.entities.values;
      for (const e of entities) {
        if (e.polygon) {
          const c = Color.CYAN.withAlpha(opacity * 0.45);
          e.polygon.material = new ColorMaterialProperty(c);
        }
        if (e.point) {
          e.point.color = new ColorMaterialProperty(
            Color.fromCssColorString("#22d3ee").withAlpha(opacity),
          );
        }
      }
    }
    this.notify();
  }

  async remove(id: string): Promise<void> {
    const layer = this.map.get(id);
    if (!layer) return;
    if (layer.dataSource) {
      await this.viewer.dataSources.remove(layer.dataSource, true);
    }
    if (layer.tileset) {
      this.viewer.scene.primitives.remove(layer.tileset);
    }
    if (layer.imageryLayer) {
      this.viewer.imageryLayers.remove(layer.imageryLayer, true);
    }
    if (layer.insarCache?.blobUrl) {
      URL.revokeObjectURL(layer.insarCache.blobUrl);
    }
    this.map.delete(id);
    this.notify();
  }

  private _attachInsarImagery(
    blobUrl: string,
    rectangle: [number, number, number, number],
    opacity: number,
  ): ImageryLayer {
    const [west, south, east, north] = rectangle;
    const provider = new SingleTileImageryProvider({
      url: blobUrl,
      rectangle: Rectangle.fromDegrees(west, south, east, north),
    });
    const imageryLayer = this.viewer.imageryLayers.addImageryProvider(provider);
    imageryLayer.alpha = opacity;
    return imageryLayer;
  }

  async refreshInsarLayer(id: string): Promise<void> {
    const layer = this.map.get(id);
    if (!layer?.insarCache) return;
    const cache = layer.insarCache;
    const { canvas, blobUrl } = await recolorGeotiffCanvas(
      cache.values,
      cache.width,
      cache.height,
      this.insarThresholds,
      cache.nodata,
    );
    void canvas;
    if (layer.imageryLayer) {
      this.viewer.imageryLayers.remove(layer.imageryLayer, true);
    }
    URL.revokeObjectURL(cache.blobUrl);
    const imageryLayer = await this._attachInsarImagery(
      blobUrl,
      cache.rectangle,
      layer.opacity,
    );
    cache.blobUrl = blobUrl;
    cache.thresholds = { ...this.insarThresholds };
    layer.imageryLayer = imageryLayer;
    this.applyTemporalFilter();
  }

  /** Overlay InSAR: GeoTIFF + colormap deformação (heatmap). */
  async addInsarGeotiff(opts: AddInsarGeotiffOptions): Promise<string> {
    const id = newId();
    const thresholds = opts.thresholds ?? this.insarThresholds;
    const opacity = opts.opacity ?? this.insarOpacity;

    const buffer = await fetchGeotiffBuffer(opts.geotiffUrl);
    const overlay = await loadGeotiffOverlay(
      buffer,
      thresholds,
      opts.epochDate ?? null,
    );

    const imageryLayer = this._attachInsarImagery(
      overlay.blobUrl,
      overlay.rectangle,
      opacity,
    );

    const rasterKind = opts.rasterKind ?? "displacement";
    const record: InternalLayer = {
      id,
      name: opts.name,
      kind: "insar",
      visible: true,
      opacity,
      temporal: opts.epochDate
        ? { epochFrom: opts.epochDate, epochTo: opts.epochDate }
        : undefined,
      source: opts.geotiffUrl,
      imageryLayer,
      insarCache: {
        values: overlay.values,
        width: overlay.width,
        height: overlay.height,
        nodata: overlay.nodata,
        rectangle: overlay.rectangle,
        epochDate: opts.epochDate ?? null,
        rasterKind,
        thresholds: { ...thresholds },
        blobUrl: overlay.blobUrl,
      },
    };
    this.map.set(id, record);
    this.applyTemporalFilter();
    if (opts.flyTo) {
      const [w, s, e, n] = overlay.rectangle;
      void this.viewer.camera.flyTo({
        destination: Rectangle.fromDegrees(w, s, e, n),
        duration: 2,
      });
    }
    this.notify();
    return id;
  }

  async flyToLayer(id: string): Promise<void> {
    const layer = this.map.get(id);
    if (!layer) return;
    if (layer.dataSource) flyToDataSource(this.viewer, layer.dataSource);
    else if (layer.tileset) flyToTileset(this.viewer, layer.tileset);
    else if (layer.imageryLayer) {
      const rect = layer.imageryLayer.imageryProvider.rectangle;
      if (rect) {
        void this.viewer.camera.flyTo({ destination: rect, duration: 2 });
      }
    }
  }

  async addGeoJson(opts: AddGeoJsonOptions): Promise<string> {
    const id = newId();
    const ds = await GeoJsonDataSource.load(opts.data, {
      stroke: Color.fromCssColorString("#38bdf8"),
      fill: Color.fromCssColorString("#0ea5e9").withAlpha(0.35),
      strokeWidth: 2,
      markerColor: Color.fromCssColorString("#fbbf24"),
      markerSize: 10,
    });
    ds.name = opts.name;
    await this.viewer.dataSources.add(ds);

    const record: InternalLayer = {
      id,
      name: opts.name,
      kind: "geojson",
      visible: true,
      opacity: 1,
      temporal: opts.temporal,
      source: typeof opts.data === "string" ? opts.data : "inline",
      dataSource: ds,
    };
    this.map.set(id, record);
    this.applyTemporalFilter();
    if (opts.flyTo) flyToDataSource(this.viewer, ds);
    this.notify();
    return id;
  }

  async add3DTiles(opts: Add3DTilesOptions): Promise<string> {
    const id = newId();
    let tileset: Cesium3DTileset;
    if (opts.ionAssetId != null) {
      const resource = await IonResource.fromAssetId(opts.ionAssetId);
      tileset = await Cesium3DTileset.fromUrl(resource);
    } else {
      tileset = await Cesium3DTileset.fromUrl(opts.url);
    }

    if (opts.pointCloud) {
      tileset.pointCloudShading.attenuation = true;
      tileset.pointCloudShading.eyeDomeLighting = true;
      tileset.pointCloudShading.eyeDomeLightingStrength = 0.4;
      const size = opts.pointSize ?? 2;
      tileset.style = new Cesium3DTileStyle({
        pointSize: String(size),
        color: "color('#67e8f9')",
      });
    }

    this.viewer.scene.primitives.add(tileset);

    const record: InternalLayer = {
      id,
      name: opts.name,
      kind: "3dtiles",
      visible: true,
      opacity: 1,
      temporal: opts.temporal,
      source: opts.url || `ion:${opts.ionAssetId}`,
      tileset,
    };
    this.map.set(id, record);
    this.applyTemporalFilter();
    if (opts.flyTo) flyToTileset(this.viewer, tileset);
    this.notify();
    return id;
  }

  /** Nuvem de pontos LAS convertida em 3D Tiles (pnts). */
  async addPointCloudTileset(
    name: string,
    tilesetUrl: string,
    flyTo = true,
  ): Promise<string> {
    return this.add3DTiles({
      name,
      url: tilesetUrl,
      pointCloud: true,
      pointSize: 2,
      flyTo,
    });
  }

  async addRaster(opts: AddRasterOptions): Promise<string> {
    const id = newId();
    let provider;

    if (opts.mode === "xyz") {
      provider = new UrlTemplateImageryProvider({ url: opts.url });
    } else if (opts.mode === "wms") {
      provider = new WebMapServiceImageryProvider({
        url: opts.url,
        layers: opts.layers ?? "",
        parameters: { transparent: true, format: "image/png" },
      });
    } else {
      const rect = opts.rectangle
        ? Rectangle.fromDegrees(...opts.rectangle)
        : undefined;
      provider = new SingleTileImageryProvider({
        url: opts.url,
        rectangle: rect,
      });
    }

    const imageryLayer = this.viewer.imageryLayers.addImageryProvider(provider);
    imageryLayer.alpha = opts.opacity ?? 0.85;

    const record: InternalLayer = {
      id,
      name: opts.name,
      kind: "raster",
      visible: true,
      opacity: opts.opacity ?? 0.85,
      temporal: opts.temporal,
      source: opts.url,
      imageryLayer,
    };
    this.map.set(id, record);
    this.applyTemporalFilter();
    this.notify();
    return id;
  }

  getKindLabel(kind: LayerKind): string {
    switch (kind) {
      case "geojson":
        return "GeoJSON";
      case "3dtiles":
        return "3D Tiles";
      case "raster":
        return "Raster";
      case "insar":
        return "InSAR";
    }
  }
}

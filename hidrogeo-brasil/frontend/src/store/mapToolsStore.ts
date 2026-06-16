import { create } from "zustand";
import type { OutletBasinResult } from "../types/outlet-basin";
import type { ImportedMapLayer, MapCaptureApi } from "../types/map-tools";

export type MeasureMode = "none" | "distance" | "area" | "export" | "outlet" | "locationMap";

type MapToolsState = {
  measureMode: MeasureMode;
  measurePoints: [number, number][];
  measureLabel: string | null;
  exportPolygon: [number, number][];
  exportLayers: string[];
  exportFormat: "geojson" | "kml" | "shp";
  locationMapTitle: string;
  locationMapLoading: boolean;
  locationMapIncludeAutoLegend: boolean;
  locationMapCustomLegend: string;
  outletBasin: OutletBasinResult | null;
  outletLoading: boolean;
  importedLayers: ImportedMapLayer[];
  mapCaptureApi: MapCaptureApi | null;
  flowMonth: number;
  animateFlow: boolean;
  flowPlaying: boolean;
  flowByBasin: Record<string, number>;
  flowDefault: number;
  flowLabel: string;
  geologyChatOpen: boolean;
  setMeasureMode: (m: MeasureMode) => void;
  addMeasurePoint: (lon: number, lat: number) => void;
  clearMeasure: () => void;
  setMeasureLabel: (l: string | null) => void;
  setExportPolygon: (p: [number, number][]) => void;
  setExportLayers: (l: string[]) => void;
  setExportFormat: (f: "geojson" | "kml" | "shp") => void;
  setLocationMapTitle: (t: string) => void;
  setLocationMapLoading: (v: boolean) => void;
  setLocationMapIncludeAutoLegend: (v: boolean) => void;
  setLocationMapCustomLegend: (t: string) => void;
  setOutletBasin: (b: OutletBasinResult | null) => void;
  setOutletLoading: (v: boolean) => void;
  addImportedLayer: (layer: ImportedMapLayer) => void;
  removeImportedLayer: (id: string) => void;
  setImportedLayerVisible: (id: string, visible: boolean) => void;
  setMapCaptureApi: (api: MapCaptureApi | null) => void;
  setFlowMonth: (m: number) => void;
  setAnimateFlow: (v: boolean) => void;
  setFlowPlaying: (v: boolean) => void;
  setFlowData: (byBasin: Record<string, number>, def: number, label: string) => void;
  setGeologyChatOpen: (v: boolean) => void;
  toggleGeologyChat: () => void;
};

export const useMapToolsStore = create<MapToolsState>((set) => ({
  measureMode: "none",
  measurePoints: [],
  measureLabel: null,
  exportPolygon: [],
  exportLayers: ["rivers", "lithology"],
  exportFormat: "geojson",
  locationMapTitle: "Mapa de localização",
  locationMapLoading: false,
  locationMapIncludeAutoLegend: true,
  locationMapCustomLegend: "",
  outletBasin: null,
  outletLoading: false,
  importedLayers: [],
  mapCaptureApi: null,
  flowMonth: 1,
  animateFlow: false,
  flowPlaying: false,
  flowByBasin: {},
  flowDefault: 0.5,
  flowLabel: "Jan",
  geologyChatOpen: false,
  setMeasureMode: (m) =>
    set({
      measureMode: m,
      measurePoints: [],
      measureLabel: null,
      exportPolygon: [],
      outletBasin: null,
    }),
  addMeasurePoint: (lon, lat) =>
    set((s) => ({ measurePoints: [...s.measurePoints, [lon, lat]] })),
  clearMeasure: () =>
    set({
      measurePoints: [],
      measureLabel: null,
      exportPolygon: [],
      measureMode: "none",
      outletBasin: null,
      outletLoading: false,
      locationMapLoading: false,
    }),
  setMeasureLabel: (l) => set({ measureLabel: l }),
  setExportPolygon: (p) => set({ exportPolygon: p }),
  setExportLayers: (l) => set({ exportLayers: l }),
  setExportFormat: (f) => set({ exportFormat: f }),
  setLocationMapTitle: (t) => set({ locationMapTitle: t }),
  setLocationMapLoading: (v) => set({ locationMapLoading: v }),
  setLocationMapIncludeAutoLegend: (v) => set({ locationMapIncludeAutoLegend: v }),
  setLocationMapCustomLegend: (t) => set({ locationMapCustomLegend: t }),
  setOutletBasin: (b) => set({ outletBasin: b }),
  setOutletLoading: (v) => set({ outletLoading: v }),
  addImportedLayer: (layer) =>
    set((s) => ({ importedLayers: [...s.importedLayers, layer] })),
  removeImportedLayer: (id) =>
    set((s) => ({ importedLayers: s.importedLayers.filter((l) => l.id !== id) })),
  setImportedLayerVisible: (id, visible) =>
    set((s) => ({
      importedLayers: s.importedLayers.map((l) => (l.id === id ? { ...l, visible } : l)),
    })),
  setMapCaptureApi: (api) => set({ mapCaptureApi: api }),
  setFlowMonth: (m) => set({ flowMonth: m }),
  setAnimateFlow: (v) => set({ animateFlow: v }),
  setFlowPlaying: (v) => set({ flowPlaying: v }),
  setFlowData: (byBasin, def, label) => set({ flowByBasin: byBasin, flowDefault: def, flowLabel: label }),
  setGeologyChatOpen: (v) => set({ geologyChatOpen: v }),
  toggleGeologyChat: () => set((s) => ({ geologyChatOpen: !s.geologyChatOpen })),
}));

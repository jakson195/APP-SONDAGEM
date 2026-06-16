import { create } from "zustand";

type BasemapId = "satellite" | "terrain" | "dark";

export const MINING_LAYER_IDS = [
  "mining_leilao_areas",
  "mining_processes",
  "source_protection",
  "mining_blocks",
  "placer_reserves",
  "mining_leases",
] as const;

export type MiningLayerId = (typeof MINING_LAYER_IDS)[number];

/** Visibilidade inicial HidroGeo Brasil (mapa completo). */
export const HIDROGEO_VISIBLE_DEFAULTS: Record<string, boolean> = {
  rivers: true,
  stream_category_1: true,
  stream_category_2: true,
  stream_category_3: true,
  stream_category_4: true,
  springs: true,
  lithology: true,
  water_bodies: true,
  hydro_regions: false,
  basins: false,
  states: true,
  municipalities: true,
  mining_leilao_areas: false,
  mining_processes: false,
  source_protection: false,
  mining_blocks: false,
  placer_reserves: false,
  mining_leases: false,
  magnetometry_ternary: false,
  magnetometry_anomaly: false,
};

type LayerState = {
  visible: Record<string, boolean>;
  opacity: Record<string, number>;
  basemap: BasemapId;
  selectedFeature: unknown | null;
  setVisible: (id: string, v: boolean) => void;
  setOpacity: (id: string, o: number) => void;
  setMiningEnabled: (enabled: boolean) => void;
  isMiningEnabled: () => boolean;
  setBasemap: (b: BasemapId) => void;
  setSelectedFeature: (f: unknown | null) => void;
  initLayers: (ids: string[], defaults: Record<string, boolean>) => void;
  /** Restaura catálogo HidroGeo (hidro + geo + ANM SIGMINE). */
  applyHidroGeoCatalog: (defaults: Record<string, boolean>) => void;
  /** Viewer ANM leilão — só polígonos SOPLE. */
  applyLeilaoOnlyLayers: () => void;
};

export const useLayerStore = create<LayerState>((set, get) => ({
  visible: { ...HIDROGEO_VISIBLE_DEFAULTS },
  opacity: {
    rivers: 0.95,
    stream_category_1: 0.9,
    stream_category_2: 0.92,
    stream_category_3: 0.93,
    stream_category_4: 0.94,
    springs: 0.95,
    lithology: 0.55,
    water_bodies: 0.7,
    basins: 0.4,
    hydro_regions: 0.35,
    states: 0.95,
    municipalities: 0.85,
    mining_processes: 0.65,
    mining_leilao_areas: 0.72,
    mining_leilao_upcoming: 0.85,
    source_protection: 0.7,
    mining_blocks: 0.6,
    placer_reserves: 0.65,
    mining_leases: 0.55,
    magnetometry_ternary: 0.72,
    magnetometry_anomaly: 0.75,
  },
  basemap: "satellite",
  selectedFeature: null,
  setVisible: (id, v) => set((s) => ({ visible: { ...s.visible, [id]: v } })),
  setOpacity: (id, o) => set((s) => ({ opacity: { ...s.opacity, [id]: o } })),
  setMiningEnabled: (enabled) =>
    set((s) => {
      const visible = { ...s.visible };
      for (const id of MINING_LAYER_IDS) {
        if (!enabled) {
          visible[id] = false;
          continue;
        }
        visible[id] =
          id === "mining_processes" ||
          id === "source_protection" ||
          id === "mining_blocks" ||
          id === "placer_reserves" ||
          id === "mining_leases";
      }
      return { visible };
    }),
  isMiningEnabled: () =>
    MINING_LAYER_IDS.some(
      (id) => id !== "mining_leilao_areas" && get().visible[id],
    ),
  setBasemap: (b) => set({ basemap: b }),
  setSelectedFeature: (f) => set({ selectedFeature: f }),
  initLayers: (ids, defaults) =>
    set((s) => {
      const visible = { ...s.visible };
      const opacity = { ...s.opacity };
      for (const id of ids) {
        if (visible[id] === undefined) visible[id] = defaults[id] ?? false;
        if (opacity[id] === undefined) opacity[id] = 0.85;
      }
      return { visible, opacity };
    }),
  applyHidroGeoCatalog: (defaults) =>
    set((s) => {
      const visible = { ...s.visible };
      for (const [id, def] of Object.entries(defaults)) {
        visible[id] = def;
      }
      for (const [id, def] of Object.entries(HIDROGEO_VISIBLE_DEFAULTS)) {
        if (visible[id] === undefined) visible[id] = def;
      }
      visible.mining_leilao_areas = false;
      return { visible };
    }),
  applyLeilaoOnlyLayers: () =>
    set((s) => {
      const visible = { ...s.visible };
      for (const key of Object.keys(visible)) {
        visible[key] =
          key === "mining_leilao_areas" ||
          key === "mining_leilao_upcoming" ||
          key === "states" ||
          key === "municipalities";
      }
      visible.mining_leilao_upcoming = true;
      return { visible };
    }),
}));

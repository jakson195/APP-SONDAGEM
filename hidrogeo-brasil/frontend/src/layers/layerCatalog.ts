import type { LayerGroup } from "../types";

/** Catálogo local — garante camadas mesmo se a API estiver desatualizada. */
export const FALLBACK_LAYER_GROUPS: LayerGroup[] = [
  {
    id: "hydro",
    label: "Hidrografia",
    layers: [
      {
        id: "rivers",
        label: "Rios principais (ord. ≥5)",
        type: "mvt",
        tileTemplate: "/tiles/public.rivers/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "stream_category_1",
        label: "Córrego — 1ª categoria",
        type: "mvt",
        tileTemplate: "/tiles/public.stream_category_1/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "stream_category_2",
        label: "Córrego — 2ª categoria",
        type: "mvt",
        tileTemplate: "/tiles/public.stream_category_2/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "stream_category_3",
        label: "Córrego — 3ª categoria",
        type: "mvt",
        tileTemplate: "/tiles/public.stream_category_3/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "stream_category_4",
        label: "Córrego — 4ª categoria",
        type: "mvt",
        tileTemplate: "/tiles/public.stream_category_4/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "springs",
        label: "Nascentes",
        type: "mvt",
        tileTemplate: "/tiles/public.springs/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "water_bodies",
        label: "Corpos hídricos",
        type: "mvt",
        tileTemplate: "/tiles/public.water_bodies/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "hydro_regions",
        label: "Regiões hidrográficas",
        type: "mvt",
        tileTemplate: "/tiles/public.hydro_regions/{z}/{x}/{y}.pbf",
        defaultVisible: false,
      },
      {
        id: "basins",
        label: "Bacias hidrográficas",
        type: "mvt",
        tileTemplate: "/tiles/public.basins/{z}/{x}/{y}.pbf",
        defaultVisible: false,
      },
    ],
  },
  {
    id: "geo",
    label: "Geologia",
    layers: [
      {
        id: "lithology",
        label: "Litologia (CPRM/SGB)",
        type: "mvt",
        tileTemplate: "/tiles/public.lithology/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
    ],
  },
  {
    id: "geophysics",
    label: "Geofísica (CPRM/SGB)",
    layers: [
      {
        id: "magnetometry_ternary",
        label: "Magnetometria — mapa ternário",
        type: "raster",
        defaultVisible: false,
      },
      {
        id: "magnetometry_anomaly",
        label: "Magnetometria — anomalia magnética",
        type: "raster",
        defaultVisible: false,
      },
    ],
  },
  {
    id: "admin",
    label: "Limites administrativos",
    layers: [
      {
        id: "states",
        label: "Divisa — Estados (UF)",
        type: "mvt",
        tileTemplate: "/tiles/public.states/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
      {
        id: "municipalities",
        label: "Divisa — Municípios",
        type: "mvt",
        tileTemplate: "/tiles/public.municipalities/{z}/{x}/{y}.pbf",
        defaultVisible: true,
      },
    ],
  },
  {
    id: "mining",
    label: "Mineração (ANM)",
    layers: [
      {
        id: "mining_processes",
        label: "Processos minerários",
        type: "mvt",
        tileTemplate: "/tiles/public.mining_processes/{z}/{x}/{y}.pbf",
        defaultVisible: false,
      },
      {
        id: "source_protection",
        label: "Proteção de fonte",
        type: "mvt",
        tileTemplate: "/tiles/public.source_protection/{z}/{x}/{y}.pbf",
        defaultVisible: false,
      },
      {
        id: "mining_blocks",
        label: "Áreas de bloqueio",
        type: "mvt",
        tileTemplate: "/tiles/public.mining_blocks/{z}/{x}/{y}.pbf",
        defaultVisible: false,
      },
      {
        id: "placer_reserves",
        label: "Reservas garimpeiras",
        type: "mvt",
        tileTemplate: "/tiles/public.placer_reserves/{z}/{x}/{y}.pbf",
        defaultVisible: false,
      },
      {
        id: "mining_leases",
        label: "Arrendamentos",
        type: "mvt",
        tileTemplate: "/tiles/public.mining_leases/{z}/{x}/{y}.pbf",
        defaultVisible: false,
      },
    ],
  },
];

const GROUP_ORDER = ["hydro", "geo", "geophysics", "admin", "mining", "risk", "base"];

/** Leilão SOPLE tem viewer próprio — ocultar camada leilão no HidroGeo. Geofísica oculta por pedido. */
export function filterLayerGroupsForApp(groups: LayerGroup[]): LayerGroup[] {
  return groups
    .filter((g) => g.id !== "geotech" && g.id !== "geophysics")
    .map((g) => {
      if (g.id !== "mining") return g;
      return {
        ...g,
        layers: (g.layers ?? []).filter((l) => l.id !== "mining_leilao_areas"),
      };
    });
}

export function mergeLayerGroups(apiGroups: LayerGroup[]): LayerGroup[] {
  const byId = new Map<string, LayerGroup>();
  for (const g of apiGroups) byId.set(g.id, { ...g, layers: [...(g.layers ?? [])] });

  for (const fallback of FALLBACK_LAYER_GROUPS) {
    const existing = byId.get(fallback.id);
    if (!existing) {
      byId.set(fallback.id, fallback);
      continue;
    }
    const known = new Set(existing.layers.map((l) => l.id));
    for (const layer of fallback.layers) {
      if (!known.has(layer.id)) existing.layers.push(layer);
    }
  }

  return GROUP_ORDER.map((id) => byId.get(id)).filter((g): g is LayerGroup => Boolean(g));
}

export function collectLayerDefaults(groups: LayerGroup[]): {
  ids: string[];
  defaults: Record<string, boolean>;
} {
  const ids: string[] = [];
  const defaults: Record<string, boolean> = {};
  for (const g of groups) {
    for (const l of g.layers ?? []) {
      ids.push(l.id);
      defaults[l.id] = l.defaultVisible ?? false;
    }
  }
  return { ids, defaults };
}

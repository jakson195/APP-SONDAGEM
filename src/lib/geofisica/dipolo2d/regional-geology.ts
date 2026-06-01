import { corTipoRocha } from "@/lib/tipos-rocha";
import type { GeologicMaterialRho, RegionalGeologyProfile } from "./interpret-types";
import { inferResistivityNormProfile } from "./resistivity-norms-br";

function mat(
  id: string,
  nome: string,
  rhoMin: number,
  rhoMax: number,
  prior: number,
  cor?: string,
): GeologicMaterialRho {
  return {
    id,
    nome,
    cor: cor ?? corTipoRocha(nome) ?? "#94a3b8",
    rhoMinOhmM: rhoMin,
    rhoMaxOhmM: rhoMax,
    prior,
  };
}

/** Materiais genéricos (fallback Brasil). */
const MATERIAIS_GENERICOS: GeologicMaterialRho[] = [
  mat("solo_superficial", "Solo superficial / aterro", 5, 80, 0.7),
  mat("argila", "Argila média", 8, 120, 0.85),
  mat("silte", "Silte médio", 15, 150, 0.75),
  mat("areia_fina", "Areia fina média", 30, 400, 0.8),
  mat("areia_grossa", "Areia grossa média", 80, 1200, 0.7),
  mat("cascalho", "Cascalho / grauvaque", 150, 2500, 0.55),
  mat("laterita", "Laterita / crosta ferruginosa", 100, 800, 0.5),
  mat("rocha_alterada", "Rocha alterada", 80, 600, 0.65),
  mat("basalto", "Basalto / rocha ígnea", 500, 20000, 0.6),
  mat("granito", "Granito / rocha resistente", 300, 15000, 0.45),
];

/** Costa norte de SC / Garuva — Barreiras, colúvios, Serra do Mar. */
const MATERIAIS_COSTA_SC: GeologicMaterialRho[] = [
  mat("aterro", "Aterro / solo antropizado", 5, 60, 0.55, "#8b7355"),
  mat("coluvio", "Colúvio / solo residual", 25, 250, 0.8, "#a16207"),
  mat("areia_barreiras", "Areia Barreiras (média a grossa)", 40, 500, 0.9, "#ca8a04"),
  mat("argila_barreiras", "Argila Barreiras", 10, 90, 0.85, "#b45309"),
  mat("silte_marinho", "Silte / finos litorâneos", 15, 120, 0.7, "#d97706"),
  mat("laterita_costeira", "Laterita / ferricrete", 120, 900, 0.65, "#c2410c"),
  mat("cascalho_fluvial", "Cascalho fluvial / conglomerado", 200, 3000, 0.5, "#78716c"),
  mat("metassedimento", "Metassedimento / phyllite", 150, 1200, 0.55, "#57534e"),
  mat("basalto_serra", "Basalto Serra Geral (fraturado)", 400, 8000, 0.75, "#44403c"),
  mat("granito_gnaisse", "Granito / gnaisse de base", 250, 12000, 0.5, "#292524"),
];

/** Planície costeira sul (RS/SC) — sedimentos quaternários espessos. */
const MATERIAIS_PLANICIE_SUL: GeologicMaterialRho[] = [
  mat("solo_superficial", "Solo superficial", 8, 70, 0.75),
  mat("argila_lacustre", "Argila lacustre / gley", 5, 50, 0.8),
  mat("silte", "Silte médio", 20, 100, 0.8),
  mat("areia", "Areia média média", 40, 350, 0.85),
  mat("areia_grossa", "Areia grossa média", 100, 800, 0.7),
  mat("cascalho", "Cascalho", 200, 2000, 0.55),
  mat("basalto", "Basalto", 500, 15000, 0.5),
];

type RegionBox = {
  name: string;
  province: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  summary: string;
  formations: string[];
  materials: GeologicMaterialRho[];
};

const REGIONS: RegionBox[] = [
  {
    name: "Costa norte de Santa Catarina (Garuva / Itapoá)",
    province: "Província Costeira do Atlântico Sul",
    latMin: -27.2,
    latMax: -25.8,
    lngMin: -49.5,
    lngMax: -48.2,
    summary:
      "Domínio de coberturas sedimentares Cenozoicas (Formação Barreiras), solos residuais e colúvios sobre metassedimentos e rochas ígneas da Serra do Mar. Expectativa de camadas superficiais condutivas (argilas/areias finas saturadas) sobre unidades mais resistentes (laterita, basalto, granito).",
    formations: [
      "Formação Barreiras (Neogene)",
      "Depósitos coluviais / eluviais",
      "Metassedimentos Brusque / Itajaí",
      "Basalto Serra Geral",
      "Granitos / gnaisses",
    ],
    materials: MATERIAIS_COSTA_SC,
  },
  {
    name: "Litoral centro-sul SC (Criciúma / Tubarão / Florianópolis)",
    province: "Costão e planície — Barreiras e metassedimentos",
    latMin: -29.5,
    latMax: -27.15,
    lngMin: -49.9,
    lngMax: -48.3,
    summary:
      "Formação Barreiras com argilas, arenitos e conglomerados; depósitos lagunares/aluvionais; costões com metassedimentos e vulcânicos. Evitar interpretação genérica só como «areia» — incluir finos, arenitos e rocha de costão.",
    formations: [
      "Formação Barreiras (QBb)",
      "Depósitos lagunares / aluvionais",
      "Metassedimentos (costão)",
      "Serra Geral (morros)",
    ],
    materials: MATERIAIS_COSTA_SC,
  },
  {
    name: "Litoral sul (SC/RS) — planície ampla",
    province: "Planície costeira",
    latMin: -34.0,
    latMax: -29.5,
    lngMin: -53.5,
    lngMax: -48.5,
    summary:
      "Sedimentos quaternários de planície costeira e deltaicos; argilas moles a areias com resistividade moderada. Rochas ígneas podem surgir em profundidade ou em morros residuais.",
    formations: [
      "Depósitos aluvionais / lagunas",
      "Formação Barreiras",
      "Serra Geral (subsolo)",
    ],
    materials: MATERIAIS_PLANICIE_SUL,
  },
  {
    name: "Serra Geral — planalto basáltico",
    province: "Bacia do Paraná",
    latMin: -30.0,
    latMax: -22.0,
    lngMin: -55.0,
    lngMax: -44.0,
    summary:
      "Vulcanismo continental (basalto) com espessos fluxos; resistividades altas. Horizontes alterados e solos residuais mais condutivos no topo.",
    formations: ["Basalto Serra Geral", "Lateritas / saprolito", "Arenitos Botucatu (margem)"],
    materials: [
      mat("solo_residual", "Solo residual / saprolito", 20, 200, 0.8),
      mat("argila_alteracao", "Argila de alteração", 15, 150, 0.75),
      mat("basalto_sano", "Basalto sã", 800, 25000, 0.9),
      mat("basalto_fraturado", "Basalto fraturado", 200, 2000, 0.85),
      mat("arenito", "Arenito Botucatu", 100, 800, 0.5),
    ],
  },
];

/**
 * Caracterização geológica regional por coordenadas (regras).
 * Pode ser refinada pela API com IA quando `OPENAI_API_KEY` estiver definida.
 */
function withAnchor(
  profile: Omit<
    RegionalGeologyProfile,
    "anchorLat" | "anchorLng" | "mapUnits" | "dataSources"
  >,
  lat: number,
  lng: number,
): RegionalGeologyProfile {
  return {
    ...profile,
    mapUnits: [],
    dataSources: ["Regras regionais"],
    anchorLat: lat,
    anchorLng: lng,
    resistivityNorm: inferResistivityNormProfile(lat, lng),
  };
}

export function inferRegionalGeology(lat: number, lng: number): RegionalGeologyProfile {
  for (const r of REGIONS) {
    if (lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax) {
      return withAnchor(
        {
          regionName: r.name,
          province: r.province,
          summary: r.summary,
          formations: r.formations,
          materials: r.materials,
          source: "rules",
        },
        lat,
        lng,
      );
    }
  }

  return withAnchor(
    {
      regionName: "Brasil — contexto genérico",
      province: "Não regionalizado",
      summary:
        "Coordenadas fora dos domínios pré-mapeados. Interpretação com materiais típicos de solos sedimentares e rocha de base; valide com geologia local, mapas CPRM/SESC/SC ou sondagens.",
      formations: ["Coberturas sedimentares", "Rocha de base"],
      materials: MATERIAIS_GENERICOS,
      source: "rules",
    },
    lat,
    lng,
  );
}

/** Garuva (referência do projeto) — atalho. */
export const GARUVA_DEFAULT_LOCATION = { lat: -26.283, lng: -48.67 };

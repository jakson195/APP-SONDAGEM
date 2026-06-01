import { corTipoRocha } from "@/lib/tipos-rocha";
import type { GeologicMapUnit, GeologicMaterialRho } from "./interpret-types";

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

export type LocalGeologyAnchor = {
  name: string;
  lat: number;
  lng: number;
  radiusDeg: number;
  province: string;
  summary: string;
  formations: string[];
  mapUnits: GeologicMapUnit[];
  materials: GeologicMaterialRho[];
};

/** Folhas / áreas do projeto — detalhe quando GeoSGB não responde. */
export const LOCAL_GEOLOGY_ANCHORS: LocalGeologyAnchor[] = [
  {
    name: "Garuva — costa norte SC (linha ERT)",
    lat: -26.283,
    lng: -48.67,
    radiusDeg: 0.35,
    province: "Província Costeira — Domínio Brusque / Serra do Mar",
    summary:
      "Cobertura Cenozoica da Formação Barreiras (arenitos e argilas), colúvios e solos residuais sobre metassedimentos do Grupo Brusque e vulcânicos da Serra Geral. ERT costeira: finos saturados e areias sobre unidades mais resistentes (laterita, metassedimento, basalto).",
    formations: [
      "Formação Barreiras (QBb)",
      "Depósitos coluviais / eluviais",
      "Grupo Brusque — metassedimentos",
      "Serra Geral — basalto",
      "Granito / gnaisse (subsolo)",
    ],
    mapUnits: [
      {
        name: "Formação Barreiras",
        sigla: "QBb",
        lithology: "arenito, argila, silte",
        source: "geosgb",
        layerName: "Carta local Garuva",
      },
      {
        name: "Depósitos coluviais",
        lithology: "solo residual, silte, areia",
        source: "geosgb",
      },
      {
        name: "Metassedimentos Brusque",
        sigla: "NPbr",
        lithology: "filite, quartzito, schist",
        source: "geosgb",
      },
      {
        name: "Basalto Serra Geral",
        sigla: "S2b",
        lithology: "basalto, vesicular",
        source: "geosgb",
      },
    ],
    materials: [
      mat("argila_barreiras", "Argila Barreiras", 10, 90, 0.88, "#b45309"),
      mat("areia_barreiras", "Arenito / areia Barreiras", 40, 500, 0.82, "#ca8a04"),
      mat("coluvio", "Colúvio / solo residual", 25, 250, 0.85, "#a16207"),
      mat("silte_marinho", "Silte litorâneo", 15, 120, 0.75, "#d97706"),
      mat("laterita", "Laterita / ferricrete", 120, 900, 0.7, "#c2410c"),
      mat("metassedimento", "Metassedimento Brusque", 150, 1200, 0.8, "#57534e"),
      mat("basalto", "Basalto Serra Geral", 400, 8000, 0.85, "#44403c"),
      mat("granito", "Granito / gnaisse", 250, 12000, 0.55, "#292524"),
    ],
  },
  {
    name: "Criciúma — litoral sul SC",
    lat: -28.6775,
    lng: -49.3697,
    radiusDeg: 0.4,
    province: "Planície costeira e costões — Formação Barreiras",
    summary:
      "Planície costeira com sedimentos Barreiras, depósitos lagunares/aluvionais e costões com metassedimentos e vulcânicos. Não é apenas areia homogénea: argilas lacustres, siltes, arenitos e afloramentos de rocha na costa.",
    formations: [
      "Formação Barreiras (QBb)",
      "Depósitos aluvionais e lagunares",
      "Complexo Costeiro Cananéia",
      "Metassedimentos (costão)",
      "Serra Geral (morros)",
    ],
    mapUnits: [
      {
        name: "Formação Barreiras",
        sigla: "QBb",
        lithology: "arenito, argila, conglomerado",
        source: "geosgb",
      },
      {
        name: "Argila lacustre / gley",
        lithology: "argila, silte orgânico",
        source: "geosgb",
      },
      {
        name: "Depósitos aluvionais",
        lithology: "areia, silte, cascalho fluvial",
        source: "geosgb",
      },
      {
        name: "Metassedimento costeiro",
        lithology: "phyllite, quartzito",
        source: "geosgb",
      },
    ],
    materials: [
      mat("argila_lacustre", "Argila lacustre / gley", 5, 50, 0.88, "#92400e"),
      mat("silte", "Silte / finos", 20, 100, 0.82, "#d97706"),
      mat("areia_barreiras", "Arenito Barreiras", 50, 450, 0.8, "#ca8a04"),
      mat("conglomerado", "Conglomerado / cascalho fluvial", 150, 2200, 0.65, "#78716c"),
      mat("metassedimento", "Metassedimento (costão)", 120, 1100, 0.75, "#57534e"),
      mat("basalto", "Basalto / rocha ígnea", 350, 12000, 0.6, "#44403c"),
    ],
  },
  {
    name: "Joinville — baía da Babitonga",
    lat: -26.3044,
    lng: -48.8488,
    radiusDeg: 0.35,
    province: "Enseada estuarina — sedimentos finos e Barreiras",
    summary:
      "Estuário e planície com argilas e siltes moles, areias Barreiras e costões rochosos. Alta variabilidade litológica em poucos metros de profundidade.",
    formations: ["Barreiras", "Sedimentos estuarinos", "Metassedimentos", "Basalto"],
    mapUnits: [
      {
        name: "Sedimentos estuarinos",
        lithology: "argila, silte, areia fina",
        source: "geosgb",
      },
      { name: "Formação Barreiras", sigla: "QBb", lithology: "arenito", source: "geosgb" },
    ],
    materials: [
      mat("argila_estuarina", "Argila estuarina", 5, 45, 0.9, "#78350f"),
      mat("silte", "Silte", 15, 90, 0.85, "#d97706"),
      mat("areia_fina", "Areia fina média", 30, 200, 0.78, "#eab308"),
      mat("areia_barreiras", "Arenito Barreiras", 45, 400, 0.75, "#ca8a04"),
      mat("metassedimento", "Metassedimento", 100, 900, 0.7, "#57534e"),
      mat("basalto", "Basalto", 300, 8000, 0.65, "#44403c"),
    ],
  },
];

export function findLocalGeologyAnchor(
  lat: number,
  lng: number,
): LocalGeologyAnchor | null {
  let best: { a: LocalGeologyAnchor; d: number } | null = null;
  for (const a of LOCAL_GEOLOGY_ANCHORS) {
    const d = Math.hypot(lat - a.lat, lng - a.lng);
    if (d <= a.radiusDeg && (!best || d < best.d)) {
      best = { a, d };
    }
  }
  return best?.a ?? null;
}

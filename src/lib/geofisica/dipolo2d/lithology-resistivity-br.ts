import { corTipoRocha } from "@/lib/tipos-rocha";
import type { GeologicMaterialRho } from "./interpret-types";

export type LithologyRhoRule = {
  keywords: string[];
  nome: string;
  rhoMin: number;
  rhoMax: number;
  prior: number;
  cor?: string;
};

/** Faixas de ρ (Ω·m) — keywords mais específicas primeiro. */
export const LITHOLOGY_RHO_RULES: LithologyRhoRule[] = [
  { keywords: ["argila lacustre", "gley", "argila barreiras"], nome: "Argila / finos", rhoMin: 5, rhoMax: 80, prior: 0.92 },
  { keywords: ["argila", "clay", "lutita", "mudstone", "fino"], nome: "Argila / finos", rhoMin: 5, rhoMax: 80, prior: 0.88 },
  { keywords: ["silte", "silt", "turfa", "orgân", "organic", "peat"], nome: "Silte / orgânico", rhoMin: 8, rhoMax: 120, prior: 0.88 },
  { keywords: ["arenito", "sandstone", "formação barreiras", "barreiras"], nome: "Arenito / Formação Barreiras", rhoMin: 25, rhoMax: 450, prior: 0.92 },
  { keywords: ["areia fina", "fine sand"], nome: "Areia fina", rhoMin: 25, rhoMax: 200, prior: 0.82 },
  { keywords: ["areia grossa", "coarse sand"], nome: "Areia grossa", rhoMin: 80, rhoMax: 600, prior: 0.78 },
  { keywords: ["conglomer", "grauv", "cascalho", "gravel"], nome: "Conglomerado / cascalho", rhoMin: 100, rhoMax: 2500, prior: 0.72 },
  { keywords: ["colúvio", "coluvio", "eluvio", "solo residual", "saprolito"], nome: "Colúvio / solo residual", rhoMin: 20, rhoMax: 250, prior: 0.88 },
  { keywords: ["laterita", "ferricrete", "crosta"], nome: "Laterita / ferricrete", rhoMin: 80, rhoMax: 900, prior: 0.8 },
  { keywords: ["basalto", "basalt", "vulcan", "serra geral"], nome: "Basalto / ígnea", rhoMin: 200, rhoMax: 15000, prior: 0.9 },
  { keywords: ["granito", "granite", "gnaisse", "gneiss", "cristalino"], nome: "Granito / gnaisse", rhoMin: 150, rhoMax: 12000, prior: 0.85 },
  { keywords: ["metassed", "phyllite", "xisto", "schist", "quartzito", "brusque"], nome: "Metassedimento", rhoMin: 80, rhoMax: 1500, prior: 0.85 },
  { keywords: ["calcário", "limestone", "dolom"], nome: "Calcário / dolomito", rhoMin: 50, rhoMax: 2000, prior: 0.75 },
  { keywords: ["alterada", "weathered", "fraturad"], nome: "Rocha alterada / fraturada", rhoMin: 60, rhoMax: 600, prior: 0.82 },
  { keywords: ["aluvi", "fluvial", "lagunar", "estuarin"], nome: "Sedimentos aluvionais / lagunares", rhoMin: 12, rhoMax: 180, prior: 0.86 },
  { keywords: ["aterro", "fill", "antrop"], nome: "Aterro / antropizado", rhoMin: 5, rhoMax: 60, prior: 0.7 },
  { keywords: ["areia", "sand"], nome: "Areia (genérica)", rhoMin: 40, rhoMax: 400, prior: 0.55 },
  { keywords: ["sediment", "cenozoic", "quatern"], nome: "Sedimentos cenozoicos", rhoMin: 15, rhoMax: 300, prior: 0.7 },
];

function ruleToMaterial(rule: LithologyRhoRule, id: string): GeologicMaterialRho {
  return {
    id,
    nome: rule.nome,
    cor: rule.cor ?? corTipoRocha(rule.nome) ?? "#94a3b8",
    rhoMinOhmM: rule.rhoMin,
    rhoMaxOhmM: rule.rhoMax,
    prior: rule.prior,
  };
}

/** Classifica texto litológico → material com faixa de ρ. */
export function materialFromLithologyText(text: string): GeologicMaterialRho | null {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let best: { rule: LithologyRhoRule; score: number } | null = null;
  for (const rule of LITHOLOGY_RHO_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (n.includes(kw)) score += kw.length * 2;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { rule, score };
    }
  }
  if (!best) return null;
  return ruleToMaterial(best.rule, `lith_${best.rule.nome.replace(/\s+/g, "_").slice(0, 24)}`);
}

function mergeMaterials(
  primary: GeologicMaterialRho[],
  extra: GeologicMaterialRho[],
  max = 12,
): GeologicMaterialRho[] {
  const out: GeologicMaterialRho[] = [];
  const seen = new Set<string>();
  for (const m of [...primary, ...extra]) {
    const key = m.nome.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

/** Materiais a partir de unidades cartográficas + fallback regional (sem encher de areia genérica). */
export function materialsFromGeologicTexts(
  texts: string[],
  regionalFallback: GeologicMaterialRho[] = [],
  minMaterials = 4,
): GeologicMaterialRho[] {
  const fromUnits: GeologicMaterialRho[] = [];
  const seen = new Set<string>();

  for (const raw of texts) {
    if (!raw?.trim()) continue;
    const m = materialFromLithologyText(raw);
    if (!m || seen.has(m.nome)) continue;
    seen.add(m.nome);
    fromUnits.push(m);
  }

  if (fromUnits.length >= minMaterials) {
    return mergeMaterials(fromUnits, regionalFallback).slice(0, 12);
  }

  return mergeMaterials(fromUnits, regionalFallback, 12).slice(
    0,
    Math.max(minMaterials, 12),
  );
}

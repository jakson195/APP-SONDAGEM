/**
 * Brazilian geotechnical soil / material coloring from field descriptions.
 * Classification follows substring order (most specific first): argila → silte →
 * areia fina | média | grossa → areia genérica → cascalho → aterro → organico → rocha.
 */

export type SoilMaterial =
  | "areia_fina"
  | "areia_media"
  | "areia_grossa"
  | "areia"
  | "argila"
  | "silte"
  | "cascalho"
  | "aterro"
  | "organico"
  | "rocha"
  | "other";

/** Fill colors (user specification + generic areia = média) */
export const SOIL_MATERIAL_FILL: Record<SoilMaterial, string> = {
  areia_fina: "#F7DC6F",
  areia_media: "#F4D03F",
  areia_grossa: "#D4AC0D",
  areia: "#F4D03F",
  argila: "#8B5A2B",
  silte: "#E67E22",
  cascalho: "#7F8C8D",
  aterro: "#8E44AD",
  organico: "#145A32",
  rocha: "#2C3E50",
  other: "#BDC3C7",
};

/** Border / accent strokes (slightly darker than fill) */
export const SOIL_MATERIAL_STROKE: Record<SoilMaterial, string> = {
  areia_fina: "#c4a825",
  areia_media: "#b7950b",
  areia_grossa: "#a8860b",
  areia: "#b7950b",
  argila: "#5c3d1d",
  silte: "#a84312",
  cascalho: "#566573",
  aterro: "#5b2c6f",
  organico: "#0d3d22",
  rocha: "#1a252f",
  other: "#909497",
};

export const SOIL_MATERIAL_LABEL: Record<SoilMaterial, string> = {
  areia_fina: "Areia fina",
  areia_media: "Areia média",
  areia_grossa: "Areia grossa",
  areia: "Areia",
  argila: "Argila",
  silte: "Silte",
  cascalho: "Cascalho",
  rocha: "Rocha",
  organico: "Orgânico",
  aterro: "Aterro",
  other: "Padrão",
};

export const SOIL_MATERIAL_ORDER: SoilMaterial[] = [
  "areia_fina",
  "areia_media",
  "areia_grossa",
  "areia",
  "argila",
  "silte",
  "cascalho",
  "rocha",
  "organico",
  "aterro",
  "other",
];

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Light text on dark fills for legibility in logs */
export function soilMaterialInk(kind: SoilMaterial): "#f8f9fa" | "#1a1a1a" {
  switch (kind) {
    case "rocha":
    case "organico":
    case "aterro":
    case "argila":
      return "#f8f9fa";
    default:
      return "#1a1a1a";
  }
}

function isPlaceholderDescription(raw: string, d: string): boolean {
  return (
    !d ||
    d === "—" ||
    /^(not described|not logged|below last)/i.test(raw.trim()) ||
    d.includes("nao descrito")
  );
}

/**
 * Classify material from boring description using ordered substring rules (PT-BR + common EN).
 */
export function classifySoilMaterial(raw: string): SoilMaterial {
  const d = normalize(raw);
  if (isPlaceholderDescription(raw, d)) return "other";

  if (d.includes("argila") || /\bargilos[oa]\b/.test(d)) return "argila";
  if (d.includes("silte") || /\b(silt|silty)\b/i.test(d)) return "silte";

  if (d.includes("areia fina")) return "areia_fina";
  if (d.includes("areia media")) return "areia_media";
  if (d.includes("areia grossa")) return "areia_grossa";
  if (d.includes("areia") || /\b(sand|sandy|arenoso|arenosa)\b/i.test(d)) {
    return "areia";
  }

  if (
    d.includes("cascalho") ||
    /\b(gravel|seixo|pedregulho|conglomerado)\b/i.test(d)
  ) {
    return "cascalho";
  }
  if (
    d.includes("aterro") ||
    /\b(fill|entulho|rejeito|residuo)\b/i.test(d)
  ) {
    return "aterro";
  }
  if (
    d.includes("organico") ||
    /\b(organic|peat|turfa|humus)\b/i.test(d)
  ) {
    return "organico";
  }
  if (
    d.includes("rocha") ||
    /\b(basalto|granito|gnaisse|xisto|arenito|matacao|bedrock|rock)\b/i.test(
      d,
    )
  ) {
    return "rocha";
  }

  return "other";
}

/** Returns fill hex for a layer description (same rules as {@link classifySoilMaterial}). */
export function getSoilColor(descricao: string): string {
  return SOIL_MATERIAL_FILL[classifySoilMaterial(descricao)];
}

/** Alias — older name */
export const classifySoilFromDescription = classifySoilMaterial;

import type { SoilMaterial } from "@/lib/soil-type";

/**
 * Brazilian geotechnical / geological survey–style engineering colors
 * (aterro lilás, orgânico verde, argila marrom, silte salmão, areias amarelas,
 * cascalho cinza, rocha escura). Values are chosen for A4 print clarity on white.
 */

export const CPRM_SOIL_FILL: Record<SoilMaterial, string> = {
  areia_fina: "#FFF9C4",
  areia_media: "#FFEE58",
  areia_grossa: "#FBC02D",
  areia: "#FFEE58",
  argila: "#6D4C41",
  silte: "#FFAB91",
  cascalho: "#90A4AE",
  aterro: "#7E57C2",
  organico: "#2E7D32",
  rocha: "#263238",
  other: "#ECEFF1",
};

export const CPRM_SOIL_STROKE: Record<SoilMaterial, string> = {
  areia_fina: "#c5b358",
  areia_media: "#c9b925",
  areia_grossa: "#b89318",
  areia: "#c9b925",
  argila: "#3e2723",
  silte: "#c97b63",
  cascalho: "#546e7a",
  aterro: "#4a148c",
  organico: "#1b5e20",
  rocha: "#102027",
  other: "#b0bec5",
};

/** Text color on CPRM fills */
export function cprmSoilInk(kind: SoilMaterial): "#f5f5f5" | "#1a1a1a" {
  switch (kind) {
    case "rocha":
    case "organico":
    case "aterro":
    case "argila":
      return "#f5f5f5";
    default:
      return "#1a1a1a";
  }
}

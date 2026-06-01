import {
  classifyRhoOhmM,
  NORM_BR_ERT_PADRAO,
  type ResistivityNormProfile,
} from "./resistivity-norms-br";

/** Classes geotécnicas padrão para perfil interpretativo ERT (norma BR). */
export type GeotechnicalClass = {
  material: string;
  cor: string;
  rhoMin: number;
  rhoMax: number;
};

export const GEOTECH_CLASSES: GeotechnicalClass[] = NORM_BR_ERT_PADRAO.classes.map(
  (c) => ({
    material: c.label,
    cor: c.cor,
    rhoMin: c.rhoMinOhmM,
    rhoMax: c.rhoMaxOhmM,
  }),
);

/** Converte ρ médio (Ω·m) em classe geotécnica (norma + perfil regional opcional). */
export function rhoToGeotechnical(
  meanRhoOhmM: number,
  profile: ResistivityNormProfile = NORM_BR_ERT_PADRAO,
): GeotechnicalClass {
  const band = classifyRhoOhmM(meanRhoOhmM, profile);
  return {
    material: band.label,
    cor: band.cor,
    rhoMin: band.rhoMinOhmM,
    rhoMax: band.rhoMaxOhmM,
  };
}

/** Corpo vertical alto-ρ: mantém nome litológico do mapa; demais casos usam ρ + norma. */
export function normalizeGeotechnicalLabel(
  material: string,
  meanRhoOhmM: number,
  profile: ResistivityNormProfile = NORM_BR_ERT_PADRAO,
): string {
  const n = material.toLowerCase();
  if (/diab|basalt|dique|sill/.test(n) && meanRhoOhmM >= 800) {
    return material.trim() || "Diabásio";
  }
  return classifyRhoOhmM(meanRhoOhmM, profile).label;
}

export function geotechnicalColor(
  material: string,
  profile: ResistivityNormProfile = NORM_BR_ERT_PADRAO,
): string {
  const hit = profile.classes.find((c) => c.label === material);
  if (hit) return hit.cor;
  const c = GEOTECH_CLASSES.find((g) => g.material === material);
  return c?.cor ?? "#94a3b8";
}

/**
 * Classificação de resistividade (ρ) para interpretação ERT — referências técnicas BR.
 *
 * Perfil interpretativo (3 classes): Argila / Rocha alterada / Rocha sã — faixas ERT
 * ajustáveis por região e IA.
 *
 * Tabela litológica detalhada (água, argila, areia, ígneas…): ver
 * `resistivity-reference-table-br.ts` (faixas típicas em Ω·m, com sobreposição).
 */

export type ResistivityClassId = string;

export type ResistivityClassBand = {
  id: string;
  label: string;
  rhoMinOhmM: number;
  rhoMaxOhmM: number;
  cor: string;
  description: string;
};

export type ResistivityNormProfile = {
  id: string;
  name: string;
  regionHint: string;
  references: string[];
  classes: ResistivityClassBand[];
  source: "norm" | "regional" | "ai";
  notes?: string;
};

/** Faixas pedidas + literatura ERT (valores padrão nacional). */
export const NORM_BR_ERT_PADRAO: ResistivityNormProfile = {
  id: "br-ert-padrao",
  name: "Norma de referência BR (ERT 3 classes)",
  regionHint: "Brasil — uso geral",
  references: [
    "Loke, M.H. (2010). Electrical Resistivity Tomography — tabelas de ρ para solos e rochas.",
    "Reynolds, J.M. (2011). An Introduction to Applied and Environmental Geophysics.",
    "Prática CPRM/SGB — mapeamento geológico + ERT (interpretação integrada).",
    "Investigação geotécnica: solos finos saturados vs. saprolito vs. rocha fresca.",
  ],
  source: "norm",
  classes: [
    {
      id: "argila",
      label: "Argila",
      rhoMinOhmM: 0,
      rhoMaxOhmM: 500,
      cor: "#81d4fa",
      description: "Solos finos, argila/silte saturado, colúvio argiloso",
    },
    {
      id: "rocha_alterada",
      label: "Rocha alterada",
      rhoMinOhmM: 500,
      rhoMaxOhmM: 1500,
      cor: "#a1887f",
      description: "Saprolito, zona de intemperismo, rocha fraturada alterada",
    },
    {
      id: "rocha_sa",
      label: "Rocha sã",
      rhoMinOhmM: 1500,
      rhoMaxOhmM: 10_000,
      cor: "#374151",
      description: "Rocha fresca, ígnea/metamórfica competente, baixa fratura",
    },
  ],
  notes: "Limites editáveis por região e IA (Caracterizar CPRM + IA).",
};

/** Costa SC / Barreiras — argilas e arenitos com ρ moderada na superfície. */
const NORM_COSTA_SC: ResistivityNormProfile = {
  id: "sc-litoral",
  name: "Costa SC — Barreiras / coberturas",
  regionHint: "Santa Catarina litoral (Garuva, Joinville, Criciúma)",
  references: [
    ...NORM_BR_ERT_PADRAO.references,
    "Formação Barreiras — arenitos/argilas (CPRM).",
  ],
  source: "regional",
  classes: [
    { ...NORM_BR_ERT_PADRAO.classes[0]!, rhoMaxOhmM: 450 },
    { ...NORM_BR_ERT_PADRAO.classes[1]!, rhoMinOhmM: 450, rhoMaxOhmM: 1400 },
    { ...NORM_BR_ERT_PADRAO.classes[2]!, rhoMinOhmM: 1400 },
  ],
};

/** Serra Geral / basalto — rocha alterada espessa, ρ alta em profundidade. */
const NORM_SERRA_GERAL: ResistivityNormProfile = {
  id: "serra-geral",
  name: "Serra Geral — basalto",
  regionHint: "Planalto basáltico SC/PR/RS",
  references: [
    ...NORM_BR_ERT_PADRAO.references,
    "Basalto Serra Geral — ρ alta em matriz sã; alteração superficial condutiva.",
  ],
  source: "regional",
  classes: [
    { ...NORM_BR_ERT_PADRAO.classes[0]!, rhoMaxOhmM: 400 },
    { ...NORM_BR_ERT_PADRAO.classes[1]!, rhoMinOhmM: 400, rhoMaxOhmM: 1800 },
    { ...NORM_BR_ERT_PADRAO.classes[2]!, rhoMinOhmM: 1800 },
  ],
};

const REGIONAL_NORMS: { latMin: number; latMax: number; lngMin: number; lngMax: number; profile: ResistivityNormProfile }[] = [
  { latMin: -27.2, latMax: -25.8, lngMin: -49.5, lngMax: -48.2, profile: NORM_COSTA_SC },
  { latMin: -29.5, latMax: -27.15, lngMin: -49.9, lngMax: -48.3, profile: NORM_COSTA_SC },
  { latMin: -30, latMax: -22, lngMin: -55, lngMax: -44, profile: NORM_SERRA_GERAL },
];

/** Perfil de norma por coordenada (antes do refino IA). */
export function inferResistivityNormProfile(
  lat: number,
  lng: number,
): ResistivityNormProfile {
  for (const r of REGIONAL_NORMS) {
    if (lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax) {
      return { ...r.profile, classes: r.profile.classes.map((c) => ({ ...c })) };
    }
  }
  return {
    ...NORM_BR_ERT_PADRAO,
    classes: NORM_BR_ERT_PADRAO.classes.map((c) => ({ ...c })),
  };
}

/** Classifica ρ (Ω·m) numa das três classes. */
export function classifyRhoOhmM(
  rhoOhmM: number,
  profile: ResistivityNormProfile = NORM_BR_ERT_PADRAO,
): ResistivityClassBand {
  const rho = Math.max(0, rhoOhmM);
  for (const c of profile.classes) {
    if (rho >= c.rhoMinOhmM && rho < c.rhoMaxOhmM) return c;
  }
  if (rho >= profile.classes[profile.classes.length - 1]!.rhoMinOhmM) {
    return profile.classes[profile.classes.length - 1]!;
  }
  return profile.classes[0]!;
}

export function normProfileToMaterials(profile: ResistivityNormProfile) {
  return profile.classes.map((c) => ({
    id: c.id,
    nome: c.label,
    cor: c.cor,
    rhoMinOhmM: c.rhoMinOhmM,
    rhoMaxOhmM: c.rhoMaxOhmM,
    prior: c.id === "argila" ? 0.85 : c.id === "rocha_alterada" ? 0.8 : 0.75,
  }));
}

/** Mescla limites sugeridos pela IA (JSON) com validação. */
export function mergeAiResistivityNorm(
  base: ResistivityNormProfile,
  ai: {
    classes?: Array<{
      id?: string;
      label?: string;
      rhoMinOhmM?: number;
      rhoMaxOhmM?: number;
      notes?: string;
    }>;
    summary?: string;
  } | null,
): ResistivityNormProfile {
  if (!ai?.classes?.length) return base;

  const classes = base.classes.map((c) => {
    const patch = ai.classes!.find(
      (p) => p.id === c.id || p.label?.toLowerCase() === c.label.toLowerCase(),
    );
    if (!patch) return c;
    return {
      ...c,
      rhoMinOhmM:
        typeof patch.rhoMinOhmM === "number" && patch.rhoMinOhmM >= 0
          ? patch.rhoMinOhmM
          : c.rhoMinOhmM,
      rhoMaxOhmM:
        typeof patch.rhoMaxOhmM === "number" && patch.rhoMaxOhmM > 0
          ? patch.rhoMaxOhmM
          : c.rhoMaxOhmM,
    };
  });

  return {
    ...base,
    classes,
    source: "ai",
    notes: ai.summary ?? base.notes,
    references: [...base.references, "OpenAI — faixas ρ ajustadas à região"],
  };
}

/** Anexa perfil de norma ρ ao contexto regional. */
export function attachResistivityNorm(
  lat: number,
  lng: number,
  existing?: ResistivityNormProfile | null,
): ResistivityNormProfile {
  return existing ?? inferResistivityNormProfile(lat, lng);
}

export function formatNormLegend(profile: ResistivityNormProfile): string {
  return profile.classes
    .map(
      (c) =>
        `${c.label}: ${c.rhoMinOhmM}–${c.rhoMaxOhmM} Ω·m`,
    )
    .join(" · ");
}

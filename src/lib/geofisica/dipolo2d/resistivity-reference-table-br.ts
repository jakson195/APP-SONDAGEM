import type { ResistivityNormProfile } from "./resistivity-norms-br";

/**
 * Tabela de referência — faixas típicas de resistividade (ρ) por meio físico.
 * Fonte: literatura de geofísica aplicada / investigação geotécnica no Brasil
 * (tabelas usadas em cursos e manuais ABNT-adjacentes; valores indicativos).
 *
 * Nota: faixas sobrepostas são comuns (ex.: argila vs. calcário). A classificação
 * automática do perfil usa o perfil geotécnico de 3 classes (ERT); esta tabela
 * serve como referência litológica detalhada.
 */

export type ResistivityRefRow = {
  id: string;
  meio: string;
  /** Texto legível da faixa (ex. "300 – 5.000", "> 10.000"). */
  faixaTexto: string;
  rhoMinOhmM: number | null;
  rhoMaxOhmM: number | null;
  /** Valor único quando a tabela indica ~ρ fixo. */
  rhoTypicalOhmM?: number;
  grupo: "agua" | "solo_fino" | "sedimento" | "rocha";
  cor: string;
};

/** Tabela completa (ordem de exibição). */
export const RESISTIVITY_REFERENCE_TABLE_BR: ResistivityRefRow[] = [
  {
    id: "agua_mar",
    meio: "Água do mar",
    faixaTexto: "~0,3",
    rhoMinOhmM: 0.1,
    rhoMaxOhmM: 1,
    rhoTypicalOhmM: 0.3,
    grupo: "agua",
    cor: "#0d47a1",
  },
  {
    id: "agua_rio",
    meio: "Água de rio",
    faixaTexto: "~30",
    rhoMinOhmM: 10,
    rhoMaxOhmM: 80,
    rhoTypicalOhmM: 30,
    grupo: "agua",
    cor: "#1565c0",
  },
  {
    id: "agua_destilada",
    meio: "Água destilada",
    faixaTexto: "300",
    rhoMinOhmM: 200,
    rhoMaxOhmM: 500,
    rhoTypicalOhmM: 300,
    grupo: "agua",
    cor: "#42a5f5",
  },
  {
    id: "alagadico_lama",
    meio: "Alagadiço, limo, húmus, lama",
    faixaTexto: "< 150",
    rhoMinOhmM: 1,
    rhoMaxOhmM: 150,
    grupo: "solo_fino",
    cor: "#4fc3f7",
  },
  {
    id: "argila",
    meio: "Argila",
    faixaTexto: "300 – 5.000",
    rhoMinOhmM: 300,
    rhoMaxOhmM: 5_000,
    grupo: "solo_fino",
    cor: "#81d4fa",
  },
  {
    id: "calcario",
    meio: "Calcário",
    faixaTexto: "500 – 5.000",
    rhoMinOhmM: 500,
    rhoMaxOhmM: 5_000,
    grupo: "sedimento",
    cor: "#aed581",
  },
  {
    id: "areia",
    meio: "Areia",
    faixaTexto: "1.000 – 8.000",
    rhoMinOhmM: 1_000,
    rhoMaxOhmM: 8_000,
    grupo: "sedimento",
    cor: "#fff176",
  },
  {
    id: "ignea_fraturada",
    meio: "Granito e basalto fraturados",
    faixaTexto: "500 – 10.000",
    rhoMinOhmM: 500,
    rhoMaxOhmM: 10_000,
    grupo: "rocha",
    cor: "#ff8a65",
  },
  {
    id: "ignea_integro",
    meio: "Granito e basalto íntegros",
    faixaTexto: "> 10.000",
    rhoMinOhmM: 10_000,
    rhoMaxOhmM: 100_000,
    grupo: "rocha",
    cor: "#5d4037",
  },
];

export const RESISTIVITY_TABLE_SOURCE =
  "Faixas típicas de resistividade de materiais — referência para interpretação ERT (valores indicativos; validar com geologia local e sondagens).";

/** Ordem de prioridade quando ρ cai em faixas sobrepostas (mais condutivo primeiro). */
const LOOKUP_ORDER = [
  "agua_mar",
  "agua_rio",
  "alagadico_lama",
  "agua_destilada",
  "argila",
  "calcario",
  "areia",
  "ignea_fraturada",
  "ignea_integro",
] as const;

function rhoInRange(
  rho: number,
  min: number | null,
  max: number | null,
): boolean {
  if (min != null && rho < min) return false;
  if (max != null && rho >= max) return false;
  return true;
}

function lookupInRows(
  rhoOhmM: number,
  rows: ResistivityRefRow[],
  order?: readonly string[],
): ResistivityRefRow | null {
  const rho = Math.max(0, rhoOhmM);
  const byId = new Map(rows.map((r) => [r.id, r]));

  if (order?.length) {
    for (const id of order) {
      const row = byId.get(id);
      if (row && rhoInRange(rho, row.rhoMinOhmM, row.rhoMaxOhmM)) return row;
    }
  }

  for (const row of rows) {
    if (rhoInRange(rho, row.rhoMinOhmM, row.rhoMaxOhmM)) return row;
  }

  const openTop = rows.find((r) => r.rhoMinOhmM != null && r.rhoMaxOhmM == null);
  if (openTop && rho >= (openTop.rhoMinOhmM ?? 0)) return openTop;

  return rows[rows.length - 1] ?? null;
}

/** Sugere meio físico da tabela de referência para um valor de ρ (Ω·m). */
export function lookupResistivityReference(
  rhoOhmM: number,
  rows: ResistivityRefRow[] = RESISTIVITY_REFERENCE_TABLE_BR,
): ResistivityRefRow | null {
  return lookupInRows(rhoOhmM, rows, LOOKUP_ORDER);
}

/** Tabela padrão para interpretação (3 classes geotécnicas — editável). */
export const DEFAULT_INTERPRET_CLASSIFICATION_TABLE: ResistivityRefRow[] = [
  {
    id: "argila",
    meio: "Argila",
    faixaTexto: "0 – 500",
    rhoMinOhmM: 0,
    rhoMaxOhmM: 500,
    grupo: "solo_fino",
    cor: "#81d4fa",
  },
  {
    id: "rocha_alterada",
    meio: "Rocha alterada",
    faixaTexto: "500 – 1.500",
    rhoMinOhmM: 500,
    rhoMaxOhmM: 1500,
    grupo: "rocha",
    cor: "#a1887f",
  },
  {
    id: "rocha_sa",
    meio: "Rocha sã",
    faixaTexto: "1.500 – 10.000",
    rhoMinOhmM: 1500,
    rhoMaxOhmM: 10_000,
    grupo: "rocha",
    cor: "#374151",
  },
];

export function cloneClassificationTable(
  source: ResistivityRefRow[] = DEFAULT_INTERPRET_CLASSIFICATION_TABLE,
): ResistivityRefRow[] {
  return source.map((r) => ({ ...r }));
}

export function syncRowFaixaTexto(row: ResistivityRefRow): ResistivityRefRow {
  if (row.rhoMinOhmM != null && row.rhoMaxOhmM != null) {
    return {
      ...row,
      faixaTexto: `${row.rhoMinOhmM} – ${row.rhoMaxOhmM}`,
    };
  }
  if (row.rhoMinOhmM != null && row.rhoMaxOhmM == null) {
    return { ...row, faixaTexto: `> ${row.rhoMinOhmM}` };
  }
  if (row.rhoMaxOhmM != null && row.rhoMinOhmM == null) {
    return { ...row, faixaTexto: `< ${row.rhoMaxOhmM}` };
  }
  return row;
}

/** Converte tabela do utilizador em perfil de classificação para a malha 2D. */
export function userTableToNormProfile(rows: ResistivityRefRow[]): ResistivityNormProfile {
  const classes = rows
    .filter((r) => r.meio.trim().length > 0)
    .map((r) => ({
      id: r.id,
      label: r.meio.trim(),
      rhoMinOhmM: r.rhoMinOhmM ?? 0,
      rhoMaxOhmM: r.rhoMaxOhmM ?? 100_000,
      cor: r.cor,
      description: r.faixaTexto,
    }));

  return {
    id: "user-classification",
    name: "Classificação do utilizador (tabela ρ)",
    regionHint: "Faixas definidas na tabela de referência",
    references: [RESISTIVITY_TABLE_SOURCE],
    source: "norm",
    classes,
    notes: "Secção interpretativa gerada a partir da tabela editável.",
  };
}

/** Formata faixa para exportação (Ω·m). */
export function formatRefRowRange(row: ResistivityRefRow): string {
  if (row.rhoTypicalOhmM != null && row.faixaTexto.startsWith("~")) {
    return `${row.faixaTexto} Ω·m`;
  }
  if (row.rhoMinOhmM != null && row.rhoMaxOhmM != null) {
    return `${row.faixaTexto} Ω·m`;
  }
  if (row.rhoMinOhmM != null && row.rhoMaxOhmM == null) {
    return `> ${row.rhoMinOhmM} Ω·m`;
  }
  return row.faixaTexto;
}

export function buildReferenceTableTxt(): string {
  const lines = [
    "# Tabela de referência — resistividade típica (Ω·m)",
    `# ${RESISTIVITY_TABLE_SOURCE}`,
    "",
    "meio_fisico\tfaixa_ohm_m\tgrupo",
    ...RESISTIVITY_REFERENCE_TABLE_BR.map(
      (r) => `${r.meio}\t${r.faixaTexto}\t${r.grupo}`,
    ),
  ];
  return lines.join("\n");
}

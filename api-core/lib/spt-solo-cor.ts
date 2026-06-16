import { CPRM_SOIL_FILL } from "@/lib/cprm-soil-palette";

/** Cor de fundo (hex) para representação no PDF SPT — paleta CPRM / engenharia. */
const POR_NOME_EXATO: Record<string, string> = {
  "Argila mole": "#BCAAA4",
  "Argila média": "#8D6E63",
  "Argila rija": "#5D4037",
  Silte: CPRM_SOIL_FILL.silte,
  "Silte arenoso": "#FFCCBC",
  "Areia fina": CPRM_SOIL_FILL.areia_fina,
  "Areia média": CPRM_SOIL_FILL.areia_media,
  "Areia grossa": CPRM_SOIL_FILL.areia_grossa,
  "Areia compacta": "#F9A825",
  "Areia fofa": "#FFF59D",
  Cascalho: CPRM_SOIL_FILL.cascalho,
  "Rocha alterada": "#78909C",
  "Rocha sã": CPRM_SOIL_FILL.rocha,
};

/**
 * Cor para o indicador de material no relatório SPT.
 * Usa o nome do tipo de solo do registo; fallback por palavras-chave.
 */
export function corSoloSpt(nome: string): string {
  const k = nome.trim();
  if (!k) return "#ECEFF1";
  if (POR_NOME_EXATO[k]) return POR_NOME_EXATO[k]!;

  const n = k.toLowerCase();
  if (n.includes("argila")) return "#8D6E63";
  if (n.includes("silte")) return CPRM_SOIL_FILL.silte;
  if (n.includes("areia fina")) return CPRM_SOIL_FILL.areia_fina;
  if (n.includes("areia média") || n.includes("areia media"))
    return CPRM_SOIL_FILL.areia_media;
  if (n.includes("areia grossa")) return CPRM_SOIL_FILL.areia_grossa;
  if (n.includes("areia")) return CPRM_SOIL_FILL.areia;
  if (n.includes("cascalho")) return CPRM_SOIL_FILL.cascalho;
  if (n.includes("rocha")) return CPRM_SOIL_FILL.rocha;
  return "#ECEFF1";
}

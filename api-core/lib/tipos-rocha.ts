import { CPRM_SOIL_FILL } from "@/lib/cprm-soil-palette";

export type TipoRocha = {
  nome: string;
  cor: string;
};

/**
 * Materiais para sondagem rotativa / coluna esquemática.
 * Areias fina → média → grossa: cores da paleta CPRM (amarelos por granulometria),
 * alinhada à legenda gráfica habitual em relatórios de sondagem (ex.: SONDGEO e
 * normas de representação ABNT / perfis tipo CPRM).
 */
export const TIPOS_ROCHA: TipoRocha[] = [
  { nome: "Solo residual", cor: "#a3b18a" },
  { nome: "Silte", cor: "#c2b280" },
  { nome: "Areia fina", cor: CPRM_SOIL_FILL.areia_fina },
  { nome: "Areia média", cor: CPRM_SOIL_FILL.areia_media },
  { nome: "Areia grossa", cor: CPRM_SOIL_FILL.areia_grossa },
  { nome: "Argila", cor: "#8d99ae" },
  { nome: "Rocha alterada", cor: "#adb5bd" },
  { nome: "Rocha fraturada", cor: "#6c757d" },
  { nome: "Rocha sã", cor: "#343a40" },
];

/** Cor hex do tipo, ou undefined se o nome não existir na lista. */
export function corTipoRocha(nome: string): string | undefined {
  return TIPOS_ROCHA.find((t) => t.nome === nome)?.cor;
}

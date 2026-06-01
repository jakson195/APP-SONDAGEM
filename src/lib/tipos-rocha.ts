import { TIPOS_SOLO_PRINCIPAIS } from "@/lib/nomenclatura-geologica-solo";
import { corSoloSpt } from "@/lib/spt-solo-cor";

export type TipoRocha = {
  nome: string;
  cor: string;
};

/**
 * Catálogo unificado de materiais geológicos para todas as sondagens.
 * Base: mesma nomenclatura do SPT + entradas legadas de rotativa/piezo.
 */
export const TIPOS_ROCHA: TipoRocha[] = [
  ...TIPOS_SOLO_PRINCIPAIS.map((nome) => ({
    nome,
    cor: corSoloSpt(nome),
  })),
  // Legado (nomes curtos antigos) para compatibilidade com dados já gravados:
  { nome: "Argila", cor: corSoloSpt("Argila média") },
  { nome: "Silte", cor: corSoloSpt("Silte médio") },
  { nome: "Areia fina", cor: corSoloSpt("Areia fina média") },
  { nome: "Areia média", cor: corSoloSpt("Areia média média") },
  { nome: "Areia grossa", cor: corSoloSpt("Areia grossa média") },
  { nome: "Rocha fraturada", cor: "#4b5563" },
].filter(
  (item, idx, arr) => arr.findIndex((x) => x.nome === item.nome) === idx,
);

/** Cor hex do tipo, ou undefined se o nome não existir na lista. */
export function corTipoRocha(nome: string): string | undefined {
  return TIPOS_ROCHA.find((t) => t.nome === nome)?.cor;
}

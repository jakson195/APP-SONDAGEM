import type { EstacaoBrasil, TipoEstacaoBr } from "./types";

export type CatalogoBrasil = {
  version: number;
  atualizado: string;
  fonte: string;
  estacoes: EstacaoBrasil[];
};

let cache: CatalogoBrasil | null = null;

export async function carregarCatalogoBrasil(): Promise<CatalogoBrasil> {
  if (cache) return cache;
  const res = await fetch("/data/hidrochu-br/estacoes-brasil-seed.json");
  if (!res.ok) throw new Error("Catálogo nacional indisponível");
  cache = (await res.json()) as CatalogoBrasil;
  return cache;
}

export function buscarEstacoes(
  cat: CatalogoBrasil,
  opts?: { uf?: string; q?: string; tipo?: TipoEstacaoBr },
): EstacaoBrasil[] {
  let list = cat.estacoes;
  if (opts?.uf) {
    const uf = opts.uf.toUpperCase();
    list = list.filter((e) => e.uf === uf);
  }
  if (opts?.tipo) {
    list = list.filter((e) => e.tipo === opts.tipo);
  }
  if (opts?.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    list = list.filter(
      (e) =>
        e.nome.toLowerCase().includes(q) ||
        e.municipio.toLowerCase().includes(q) ||
        e.codigo.includes(q),
    );
  }
  return list;
}

export function estacaoPorCodigo(
  cat: CatalogoBrasil,
  codigo: string,
): EstacaoBrasil | undefined {
  const c = codigo.padStart(8, "0").slice(-8);
  return cat.estacoes.find((e) => e.codigo === c || e.codigo.endsWith(c));
}

export const UFS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

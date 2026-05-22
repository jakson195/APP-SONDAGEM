import type { CoefIdf } from "@/lib/hidrochu/idf";
import type { HidroChuEstacao } from "@/lib/hidrochu/types";

export type HidroChuMunicipioDados = {
  nome: string;
  p1dia10: number;
  i15_10: number;
};

export type HidroChuCatalog = {
  fonte: string;
  referencia: string;
  periodoRetorno: number;
  idfRegional: {
    curta: CoefIdf;
    longa: CoefIdf;
    nota?: string;
  };
  totalMunicipios: number;
  municipios: HidroChuMunicipioDados[];
};

let cache: HidroChuCatalog | null = null;

function normNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function carregarCatalogoHidroChu(): Promise<HidroChuCatalog> {
  if (cache) return cache;
  const res = await fetch("/data/hidrochu/hidrochu-municipios-sc.json");
  if (!res.ok) throw new Error("Catálogo HidroChu SC indisponível");
  cache = (await res.json()) as HidroChuCatalog;
  return cache;
}

export function listaMunicipiosCatalogo(cat: HidroChuCatalog): string[] {
  return cat.municipios.map((m) => m.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function buscarMunicipio(
  cat: HidroChuCatalog,
  nome: string,
): HidroChuMunicipioDados | undefined {
  const n = normNome(nome);
  return cat.municipios.find((m) => normNome(m.nome) === n);
}

export function coeficientesIdfMunicipio(cat: HidroChuCatalog): {
  curta: CoefIdf;
  longa: CoefIdf;
} {
  return {
    curta: cat.idfRegional.curta,
    longa: cat.idfRegional.longa,
  };
}

/** Estação sintética quando não há pluviómetro ANA cadastrado no demo. */
export function estacaoDoMunicipio(
  municipio: string,
  dados?: HidroChuMunicipioDados,
): HidroChuEstacao {
  return {
    nome: dados ? `Média municipal — ${municipio}` : municipio,
    municipio,
    codigo: "—",
    latitude: "—",
    longitude: "—",
    altitude: 0,
    fonte: "EPAGRI/HidroChu (T=10 anos)",
    anoInicial: 0,
    anoFinal: 0,
  };
}

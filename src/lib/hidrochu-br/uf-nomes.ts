/** Sigla UF ↔ nome ANA TelemetriaWS (nmEstado). */
export const UF_NOME_ANA: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const NOME_POR_UF = new Map(
  Object.entries(UF_NOME_ANA).map(([uf, nome]) => [nome.toUpperCase(), uf]),
);

export function nomeEstadoAna(uf: string): string | undefined {
  return UF_NOME_ANA[uf.toUpperCase()];
}

export function ufFromNomeEstado(nome: string): string {
  const n = nome.trim().toUpperCase();
  return NOME_POR_UF.get(n) ?? "BR";
}

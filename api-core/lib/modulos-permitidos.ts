import {
  MODULOS_PLATAFORMA,
  type ModuloPlataformaChave,
  isModuloPlataformaChave,
} from "@/lib/modulos-plataforma";

/** Filtra e deduplica chaves válidas. */
export function sanitizarListaModulos(raw: unknown): ModuloPlataformaChave[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<ModuloPlataformaChave>();
  for (const x of raw) {
    if (typeof x === "string" && isModuloPlataformaChave(x)) out.add(x);
  }
  return [...out];
}

/** Mantém apenas módulos que a empresa tem ativos. */
export function intersecaoComModulosEmpresa(
  pedido: ModuloPlataformaChave[],
  empresaAtivos: Set<string>,
): ModuloPlataformaChave[] {
  return pedido.filter((m) => empresaAtivos.has(m));
}

/** Módulos efetivos para o utilizador: vazio no membership = todos os ativos na empresa. */
export function modulosEfetivosParaMembro(
  modulosPermitidosMembership: string[],
  modulosAtivosEmpresa: string[],
): ModuloPlataformaChave[] {
  const ativos = new Set(modulosAtivosEmpresa);
  if (modulosPermitidosMembership.length === 0) {
    return MODULOS_PLATAFORMA.filter((m) => ativos.has(m));
  }
  return sanitizarListaModulos(modulosPermitidosMembership).filter((m) =>
    ativos.has(m),
  );
}

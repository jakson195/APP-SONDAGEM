/** Valores de `Furo.tipo` — alinhados ao hub e à rota de registo. */
export const CAMPO_TIPO = {
  spt: "spt",
  rotativa: "rotativa",
  trado: "trado",
  piezo: "piezo",
} as const;

export type CampoTipo = (typeof CAMPO_TIPO)[keyof typeof CAMPO_TIPO];

export function isCampoTipo(v: string): v is CampoTipo {
  return (
    v === CAMPO_TIPO.spt ||
    v === CAMPO_TIPO.rotativa ||
    v === CAMPO_TIPO.trado ||
    v === CAMPO_TIPO.piezo
  );
}

/** Próximo código tipo "SR 01", "ST 02" a partir dos furos existentes. */
export function sugerirProximoCodigoComPrefixo(
  furos: { codigo: string }[],
  prefixo: string,
): string {
  const esc = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rePrefixo = new RegExp(`^${esc}\\s*(\\d+)\\s*$`, "i");
  let max = 0;
  for (const f of furos) {
    const t = f.codigo.trim();
    const m = t.match(rePrefixo) ?? t.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next =
    max > 0 ? max + 1 : furos.length > 0 ? furos.length + 1 : 1;
  return `${prefixo} ${String(next).padStart(2, "0")}`;
}

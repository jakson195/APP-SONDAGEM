import { autoImportFromSource } from "./auto-import";
import type { EstacaoBrasil, FonteHidrologica, RegistroDiarioBr } from "./types";

export type BulkImportItem = {
  codigo: string;
  nome: string;
  ok: boolean;
  total: number;
  fonteUsada: string;
  avisos: string[];
};

export type BulkImportResult = {
  ok: boolean;
  processadas: number;
  sucesso: number;
  falhas: number;
  itens: BulkImportItem[];
  series: Record<string, RegistroDiarioBr[]>;
  avisos: string[];
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Importa séries de várias estações (sequencial, com pausa ANA). */
export async function bulkImportEstacoes(opts: {
  estacoes: EstacaoBrasil[];
  dataInicio: string;
  dataFim: string;
  fonte?: FonteHidrologica;
  maxEstacoes?: number;
  pausaMs?: number;
}): Promise<BulkImportResult> {
  const max = Math.min(opts.maxEstacoes ?? 15, 50);
  const slice = opts.estacoes.slice(0, max);
  const itens: BulkImportItem[] = [];
  const series: Record<string, RegistroDiarioBr[]> = {};
  const avisos: string[] = [];
  let sucesso = 0;

  for (const est of slice) {
    const r = await autoImportFromSource({
      estacao: est,
      fonte: opts.fonte,
      dataInicio: opts.dataInicio,
      dataFim: opts.dataFim,
    });

    const item: BulkImportItem = {
      codigo: est.codigo,
      nome: est.nome,
      ok: r.ok,
      total: r.total,
      fonteUsada: String(r.fonteUsada),
      avisos: r.avisos,
    };
    itens.push(item);

    if (r.ok && r.registros.length) {
      sucesso += 1;
      series[est.codigo] = r.registros;
    }

    if (opts.pausaMs && opts.pausaMs > 0) {
      await sleep(opts.pausaMs);
    }
  }

  if (slice.length < opts.estacoes.length) {
    avisos.push(
      `Limite de ${max} estações por lote — ${opts.estacoes.length - slice.length} não processadas.`,
    );
  }

  return {
    ok: sucesso > 0,
    processadas: slice.length,
    sucesso,
    falhas: slice.length - sucesso,
    itens,
    series,
    avisos,
  };
}

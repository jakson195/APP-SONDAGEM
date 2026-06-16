import type { EstacaoBrasil, FonteHidrologica, RegistroDiarioBr } from "./types";

export type BulkImportResponse = {
  ok: boolean;
  processadas: number;
  sucesso: number;
  falhas: number;
  itens: {
    codigo: string;
    nome: string;
    ok: boolean;
    total: number;
    fonteUsada: string;
    avisos: string[];
  }[];
  series: Record<string, RegistroDiarioBr[]>;
  avisos: string[];
  periodo?: { dataInicio: string; dataFim: string };
  error?: string;
};

export type AutoImportResponse = {
  ok: boolean;
  fonteUsada: string;
  registros: RegistroDiarioBr[];
  total: number;
  maximasAnuais: { ano: number; maxMm: number }[];
  avisos: string[];
  periodo?: { dataInicio: string; dataFim: string };
  error?: string;
};

/** Importação automática via API (ANA / INMET com fallback). */
export async function autoImportFromFonte(opts: {
  estacao: EstacaoBrasil;
  fonte?: FonteHidrologica;
  dataInicio: string;
  dataFim: string;
}): Promise<AutoImportResponse> {
  let res: Response;
  try {
    res = await fetch("/api/hidrochu-br/import/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "rede";
    throw new Error(
      /fetch failed|failed to fetch|network/i.test(msg)
        ? "Ligação ao servidor falhou — confirme que a app Next.js está a correr."
        : msg,
    );
  }
  const data = (await res.json()) as AutoImportResponse & { error?: string };
  if (!res.ok) {
    throw new Error(
      data.error ??
        (res.status >= 500
          ? "Servidor indisponível ao importar da ANA — tente CSV do HidroWeb."
          : "Importação automática falhou"),
    );
  }
  return data;
}

/** Catálogo ANA ou seed via API. */
export async function fetchEstacoesApi(opts: {
  uf?: string;
  q?: string;
  fonte?: "seed" | "ana";
  refresh?: boolean;
  tipo?: "Pluviometrica" | "Fluviometrica";
  telemetrica?: "0" | "1";
}): Promise<{
  estacoes: EstacaoBrasil[];
  total: number;
  fonte: string;
  aviso?: string;
}> {
  const p = new URLSearchParams();
  if (opts.uf) p.set("uf", opts.uf);
  if (opts.q) p.set("q", opts.q);
  if (opts.fonte) p.set("fonte", opts.fonte);
  if (opts.refresh) p.set("refresh", "1");
  if (opts.tipo) p.set("tipo", opts.tipo);
  if (opts.telemetrica) p.set("telemetrica", opts.telemetrica);

  const res = await fetch(`/api/hidrochu-br/estacoes?${p}`);
  const data = (await res.json()) as {
    estacoes?: EstacaoBrasil[];
    total?: number;
    fonte?: string;
    aviso?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "Catálogo indisponível");
  return {
    estacoes: data.estacoes ?? [],
    total: data.total ?? 0,
    fonte: data.fonte ?? "—",
    aviso: data.aviso,
  };
}

/** Importação em lote — várias estações (UF / catálogo ANA). */
export async function bulkImportNacional(opts: {
  ufs?: string[];
  uf?: string;
  fonteCatalogo?: "seed" | "ana";
  tipo?: "Pluviometrica" | "Fluviometrica";
  telemetrica?: "0" | "1";
  dataInicio: string;
  dataFim: string;
  fonte?: FonteHidrologica;
  maxEstacoes?: number;
}): Promise<BulkImportResponse> {
  const res = await fetch("/api/hidrochu-br/import/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = (await res.json()) as BulkImportResponse;
  if (!res.ok) throw new Error(data.error ?? "Importação em lote falhou");
  return data;
}

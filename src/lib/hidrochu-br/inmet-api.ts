import type { RegistroDiarioBr } from "./types";

export type InmetImportResult = {
  registros: RegistroDiarioBr[];
  fonte: string;
  aviso?: string;
};

/** Lista estações automáticas INMET (API pública apitempo). */
export async function listarEstacoesInmet(): Promise<
  { codigo: string; nome: string; uf: string; lat: number; lon: number }[]
> {
  const token = process.env.INMET_API_TOKEN?.trim();
  if (!token) return [];

  const res = await fetch("https://apitempo.inmet.gov.br/estacoes/T", {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as Record<
    string,
    Record<
      string,
      { DC_NOME?: string; VL_LATITUDE?: string; VL_LONGITUDE?: string }
    >
  >;
  const out: { codigo: string; nome: string; uf: string; lat: number; lon: number }[] = [];
  for (const uf of Object.keys(data)) {
    for (const cod of Object.keys(data[uf] ?? {})) {
      const row = data[uf]![cod]!;
      out.push({
        codigo: cod,
        nome: row.DC_NOME ?? cod,
        uf,
        lat: Number(row.VL_LATITUDE?.replace(",", ".")),
        lon: Number(row.VL_LONGITUDE?.replace(",", ".")),
      });
    }
  }
  return out;
}

function parseInmetDailyJson(
  payload: unknown,
  codigoEstacao: string,
): RegistroDiarioBr[] {
  const out: RegistroDiarioBr[] = [];
  if (!payload || typeof payload !== "object") return out;

  const root = payload as Record<string, unknown>;
  for (const key of Object.keys(root)) {
    const block = root[key] as Record<string, Record<string, string>> | undefined;
    if (!block) continue;
    for (const dayKey of Object.keys(block)) {
      const row = block[dayKey];
      if (!row) continue;
      const dataRaw = row.DT_MEDICAO ?? dayKey;
      const data = dataRaw.slice(0, 10).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
      const chuva =
        row.CHUVA ??
        row.PRECIPITACAO_TOTAL ??
        row.VL_PRECIPITACAO ??
        row.PRECIPITACAO;
      const mm = chuva != null ? Number(String(chuva).replace(",", ".")) : 0;
      if (!/^\d{4}-\d{2}-\d{2}/.test(data)) continue;
      out.push({
        codigo: codigoEstacao,
        data,
        precipitacaoMm: Number.isFinite(mm) ? Math.max(0, mm) : 0,
      });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Série diária INMET (requer INMET_API_TOKEN — cadastro em cadastro.act@inmet.gov.br). */
export async function fetchInmetSerie(
  codigoInmet: string,
  dataInicio: string,
  dataFim: string,
): Promise<InmetImportResult> {
  const token = process.env.INMET_API_TOKEN?.trim();
  if (!token) {
    return {
      registros: [],
      fonte: "INMET",
      aviso:
        "Defina INMET_API_TOKEN no servidor (.env.local). Solicite em cadastro.act@inmet.gov.br",
    };
  }

  const cod = codigoInmet.toUpperCase();
  const url = `https://apitempo.inmet.gov.br/token/estacao/${cod}/${dataInicio}/${dataFim}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return {
      registros: [],
      fonte: "INMET",
      aviso: `INMET API HTTP ${res.status}. Verifique código da estação (${cod}) e token.`,
    };
  }

  const json = await res.json();
  const registros = parseInmetDailyJson(json, cod);
  return {
    registros,
    fonte: "INMET-API",
    aviso:
      registros.length < 3
        ? "Poucos registos INMET — use ANA ou CSV BDMEP."
        : undefined,
  };
}

/** Encontra estação INMET mais próxima (km) para importação automática. */
export async function inmetCodigoMaisProximo(
  lat: number,
  lon: number,
): Promise<string | null> {
  const list = await listarEstacoesInmet();
  if (!list.length) return null;
  let best: { cod: string; d: number } | null = null;
  for (const s of list) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    const d = (s.lat - lat) ** 2 + (s.lon - lon) ** 2;
    if (!best || d < best.d) best = { cod: s.codigo, d };
  }
  return best?.cod ?? null;
}

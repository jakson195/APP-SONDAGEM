import type { RegistroDiarioBr } from "./types";

const ANA_WS =
  "https://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica";

export type AnaSerieRequest = {
  codEstacao: string;
  dataInicio: string;
  dataFim: string;
  /** 1=cotas, 2=chuvas, 3=vazões */
  tipoDados?: "1" | "2" | "3";
  /** 1=bruto, 2=consistido */
  nivelConsistencia?: "1" | "2";
};

function parseXmlSerie(xml: string, codigo: string): RegistroDiarioBr[] {
  const out: RegistroDiarioBr[] = [];
  const blocks = xml.match(/<Table[^>]*>[\s\S]*?<\/Table>/gi) ?? [];
  for (const block of blocks) {
    const data =
      block.match(/<DataHora[^>]*>([^<]+)/i)?.[1] ??
      block.match(/<Data_Medicao[^>]*>([^<]+)/i)?.[1];
    const chuva =
      block.match(/<Chuva[^>]*>([^<]+)/i)?.[1] ??
      block.match(/<Valor[^>]*>([^<]+)/i)?.[1];
    const cota = block.match(/<Cota[^>]*>([^<]+)/i)?.[1];
    const vazao = block.match(/<Vazao[^>]*>([^<]+)/i)?.[1];
    if (!data) continue;
    const d = data.trim().slice(0, 10);
    const precip = Number((chuva ?? "0").replace(",", "."));
    out.push({
      codigo,
      data: d,
      precipitacaoMm: Number.isFinite(precip) ? Math.max(0, precip) : 0,
      cotaM: cota ? Number(cota.replace(",", ".")) : undefined,
      vazaoM3s: vazao ? Number(vazao.replace(",", ".")) : undefined,
    });
  }
  if (out.length) return out.sort((a, b) => a.data.localeCompare(b.data));

  const dateRe = /(\d{4}-\d{2}-\d{2})/g;
  const valRe = />([\d.,]+)</g;
  const dates = [...xml.matchAll(dateRe)].map((m) => m[1]);
  if (dates.length < 2) return out;
  return [];
}

/** Consulta série histórica ANA (TelemetriaWS). Requer rede; pode exigir credenciais em produção. */
export async function fetchAnaSerieHistorica(
  req: AnaSerieRequest,
): Promise<{ registros: RegistroDiarioBr[]; raw?: string; aviso?: string }> {
  const params = new URLSearchParams({
    codEstacao: req.codEstacao.padStart(8, "0").slice(-8),
    dataInicio: req.dataInicio,
    dataFim: req.dataFim,
    tipoDados: req.tipoDados ?? "2",
    nivelConsistencia: req.nivelConsistencia ?? "2",
  });

  const url = `${ANA_WS}?${params}`;
  const res = await fetch(url, {
    headers: { Accept: "application/xml, text/xml, */*" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return {
      registros: [],
      aviso: `ANA TelemetriaWS HTTP ${res.status}. Importe CSV do HidroWeb ou configure credenciais.`,
    };
  }

  const text = await res.text();
  const registros = parseXmlSerie(text, req.codEstacao);
  if (!registros.length) {
    return {
      registros: [],
      raw: text.slice(0, 500),
      aviso:
        "Resposta ANA sem registros parseáveis. Use importação CSV do portal HidroWeb (www.snirh.gov.br).",
    };
  }
  return { registros };
}

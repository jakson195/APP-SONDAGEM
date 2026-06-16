import type { RegistroDiarioBr } from "./types";
import { fetchUrlText } from "@/lib/http/fetch-server";

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

function parseSerieHistoricaBlock(
  block: string,
  codigo: string,
): RegistroDiarioBr[] {
  const out: RegistroDiarioBr[] = [];
  const dataHora = block.match(/<DataHora[^>]*>([^<]+)/i)?.[1]?.trim();
  if (!dataHora) return out;

  const ymd = dataHora.slice(0, 10);
  const [yearStr, monthStr] = ymd.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return out;

  for (let day = 1; day <= 31; day++) {
    const tag = `Chuva${String(day).padStart(2, "0")}`;
    const raw = block.match(new RegExp(`<${tag}[^>]*>([^<]*)`, "i"))?.[1];
    if (raw == null || raw.trim() === "") continue;
    const mm = Number(raw.replace(",", "."));
    if (!Number.isFinite(mm)) continue;
    const data = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`;
    if (new Date(`${data}T12:00:00`).getMonth() + 1 !== month) continue;
    out.push({
      codigo,
      data,
      precipitacaoMm: Math.max(0, mm),
    });
  }

  if (out.length) return out;

  const chuva =
    block.match(/<Chuva[^>]*>([^<]+)/i)?.[1] ??
    block.match(/<Maxima[^>]*>([^<]+)/i)?.[1] ??
    block.match(/<Total[^>]*>([^<]+)/i)?.[1];
  if (chuva) {
    const mm = Number(chuva.replace(",", "."));
    if (Number.isFinite(mm)) {
      out.push({
        codigo,
        data: ymd,
        precipitacaoMm: Math.max(0, mm),
      });
    }
  }
  return out;
}

function parseXmlSerie(xml: string, codigo: string): RegistroDiarioBr[] {
  const errMsg = xml.match(/<Error[^>]*>([^<]+)/i)?.[1]?.trim();
  const blocks =
    xml.match(/<SerieHistorica[\s\S]*?<\/SerieHistorica>/gi) ??
    xml.match(/<Table[^>]*>[\s\S]*?<\/Table>/gi) ??
    [];

  const out: RegistroDiarioBr[] = [];
  for (const block of blocks) {
    if (/<ErrorTable/i.test(block)) continue;
    if (/<SerieHistorica/i.test(block)) {
      out.push(...parseSerieHistoricaBlock(block, codigo));
      continue;
    }
    const data =
      block.match(/<DataHora[^>]*>([^<]+)/i)?.[1] ??
      block.match(/<Data_Medicao[^>]*>([^<]+)/i)?.[1];
    const chuva =
      block.match(/<Chuva[^>]*>([^<]+)/i)?.[1] ??
      block.match(/<Valor[^>]*>([^<]+)/i)?.[1];
    if (!data) continue;
    const precip = Number((chuva ?? "0").replace(",", "."));
    out.push({
      codigo,
      data: data.trim().slice(0, 10),
      precipitacaoMm: Number.isFinite(precip) ? Math.max(0, precip) : 0,
    });
  }

  if (!out.length && errMsg) return out;
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Consulta série histórica ANA (TelemetriaWS). */
export async function fetchAnaSerieHistorica(
  req: AnaSerieRequest,
): Promise<{ registros: RegistroDiarioBr[]; raw?: string; aviso?: string }> {
  const cod = req.codEstacao.padStart(8, "0").slice(-8);
  const baseParams = {
    codEstacao: cod,
    dataInicio: req.dataInicio,
    dataFim: req.dataFim,
    tipoDados: req.tipoDados ?? "2",
  };

  const niveis: ("1" | "2")[] =
    req.nivelConsistencia != null ? [req.nivelConsistencia] : ["2", "1"];

  for (const nivel of niveis) {
    const params = new URLSearchParams({ ...baseParams, nivelConsistencia: nivel });
    const url = `${ANA_WS}?${params}`;

    try {
      const { ok, status, text } = await fetchUrlText(url);
      if (!ok) {
        continue;
      }

      const errMsg = text.match(/<Error[^>]*>([^<]+)/i)?.[1]?.trim();
      const registros = parseXmlSerie(text, req.codEstacao);
      if (registros.length) {
        return { registros };
      }
      if (errMsg) {
        return {
          registros: [],
          aviso: `ANA: ${errMsg} Tente outro período ou importe CSV do HidroWeb.`,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "rede";
      return {
        registros: [],
        aviso: `ANA TelemetriaWS indisponível (${msg}). Importe CSV do HidroWeb.`,
      };
    }
  }

  return {
    registros: [],
    aviso:
      "ANA sem registros no período. Reduza o intervalo ou importe CSV do HidroWeb (snirh.gov.br).",
  };
}

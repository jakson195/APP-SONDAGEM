import { fetchUrlText } from "@/lib/http/fetch-server";
import type { EstacaoBrasil, TipoEstacaoBr } from "./types";
import { nomeEstadoAna, ufFromNomeEstado } from "./uf-nomes";

const ANA_INVENTARIO =
  "https://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroInventario";

export type InventarioAnaParams = {
  /** Sigla UF (SC, SP…) ou vazio = Brasil inteiro (lento, ~75 MB). */
  uf?: string;
  /** 1=fluviométrica, 2=pluviométrica, vazio=todas */
  tipoEstacao?: "1" | "2";
  /** 1=só telemétricas */
  telemetrica?: "0" | "1";
  codEstDE?: string;
  codEstATE?: string;
};

function tag(block: string, name: string): string {
  return block.match(new RegExp(`<${name}[^>]*>([^<]*)`, "i"))?.[1]?.trim() ?? "";
}

function parseInventarioXml(xml: string): EstacaoBrasil[] {
  const blocks = xml.match(/<Table diffgr:id="Table\d+"[\s\S]*?<\/Table>/gi) ?? [];
  const out: EstacaoBrasil[] = [];

  for (const block of blocks) {
    const codRaw = tag(block, "Codigo");
    if (!codRaw) continue;
    const codigo = codRaw.padStart(8, "0").slice(-8);
    const nome = tag(block, "Nome") || codigo;
    const nmEstado = tag(block, "nmEstado");
    const uf = ufFromNomeEstado(nmEstado);
    const tipoNum = tag(block, "TipoEstacao");
    let tipo: TipoEstacaoBr = "Mista";
    if (tipoNum === "1") tipo = "Fluviometrica";
    else if (tipoNum === "2") tipo = "Pluviometrica";

    const lat = Number(tag(block, "Latitude").replace(",", "."));
    const lng = Number(tag(block, "Longitude").replace(",", "."));
    const alt = tag(block, "Altitude");
    const area = tag(block, "AreaDrenagem");

    out.push({
      codigo,
      nome,
      uf,
      municipio: tag(block, "nmMunicipio") || "—",
      bacia: tag(block, "RioNome") || undefined,
      tipo,
      latitude: Number.isFinite(lat) ? lat : 0,
      longitude: Number.isFinite(lng) ? lng : 0,
      altitudeM: alt ? Number(alt.replace(",", ".")) : undefined,
      fonte: "ANA",
      operadora: tag(block, "OperadoraSigla") || undefined,
      areaDrenagemKm2: area ? Number(area.replace(",", ".")) : undefined,
      periodoInicio:
        tag(block, "PeriodoPluviometroInicio").slice(0, 10) ||
        tag(block, "PeriodoTelemetricaInicio").slice(0, 10) ||
        undefined,
    });
  }

  return out;
}

function buildInventarioUrl(p: InventarioAnaParams): string {
  const nmEstado = p.uf ? (nomeEstadoAna(p.uf) ?? p.uf) : "";
  const params = new URLSearchParams({
    codEstDE: p.codEstDE ?? "",
    codEstATE: p.codEstATE ?? "",
    tpEst: p.tipoEstacao ?? "",
    nmEst: "",
    nmRio: "",
    codSubBacia: "",
    codBacia: "",
    nmMunicipio: "",
    nmEstado,
    sgResp: "",
    sgOper: "",
    telemetrica: p.telemetrica ?? "",
  });
  return `${ANA_INVENTARIO}?${params}`;
}

/** Inventário nacional/regional ANA (HidroInventario). */
export async function fetchInventarioAna(
  params: InventarioAnaParams,
): Promise<{ estacoes: EstacaoBrasil[]; aviso?: string }> {
  const url = buildInventarioUrl(params);

  try {
    const { ok, status, text } = await fetchUrlText(url, { timeoutMs: 120_000 });
    if (!ok) {
      return {
        estacoes: [],
        aviso: `ANA HidroInventario HTTP ${status}.`,
      };
    }
    const estacoes = parseInventarioXml(text);
    if (!estacoes.length) {
      return {
        estacoes: [],
        aviso: "ANA inventário vazio para os filtros indicados.",
      };
    }
    return { estacoes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "rede";
    return { estacoes: [], aviso: `ANA HidroInventario indisponível (${msg}).` };
  }
}

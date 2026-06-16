import { fetchAnaSerieHistorica } from "./ana-telemetria";
import { gerarSerieDemo } from "./demo-series";
import { fetchInmetSerie, inmetCodigoMaisProximo } from "./inmet-api";
import type { EstacaoBrasil, FonteHidrologica, RegistroDiarioBr } from "./types";

export type AutoImportParams = {
  estacao: EstacaoBrasil;
  fonte?: FonteHidrologica;
  dataInicio: string;
  dataFim: string;
  tipoDadosAna?: "1" | "2" | "3";
};

export type AutoImportResult = {
  ok: boolean;
  fonteUsada: FonteHidrologica | string;
  registros: RegistroDiarioBr[];
  total: number;
  maximasAnuais: { ano: number; maxMm: number }[];
  avisos: string[];
};

function uniqAvisos(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((a) => a.trim())
    .filter((a) => {
      if (!a || seen.has(a)) return false;
      seen.add(a);
      return true;
    });
}

/** Resume avisos técnicos numa mensagem curta para o utilizador. */
function resumirAvisosDemo(avisos: string[]): string[] {
  const deduped = uniqAvisos(avisos);
  const anaOff = deduped.some((a) => /ANA TelemetriaWS/i.test(a));
  const inmetOff = deduped.some((a) => /INMET/i.test(a));

  if (anaOff && inmetOff) {
    return [
      "Série demo: ANA e INMET indisponíveis neste servidor.",
      "Para dados reais: importe CSV em snirh.gov.br/hidroweb ou defina INMET_API_TOKEN no .env.local.",
    ];
  }
  if (anaOff) {
    return [
      "Série demo: ANA indisponível. Importe CSV do HidroWeb para substituir.",
    ];
  }
  return deduped.slice(0, 2);
}

function maximasFromRegs(regs: RegistroDiarioBr[]) {
  const byYear = new Map<number, number>();
  for (const r of regs) {
    const y = new Date(r.data).getFullYear();
    if (!Number.isFinite(y)) continue;
    byYear.set(y, Math.max(byYear.get(y) ?? 0, r.precipitacaoMm));
  }
  return [...byYear.entries()]
    .map(([ano, maxMm]) => ({ ano, maxMm }))
    .sort((a, b) => a.ano - b.ano);
}

async function importAna(
  estacao: EstacaoBrasil,
  dataInicio: string,
  dataFim: string,
  tipoDados: "1" | "2" | "3",
): Promise<AutoImportResult> {
  const { registros, aviso } = await fetchAnaSerieHistorica({
    codEstacao: estacao.codigo,
    dataInicio,
    dataFim,
    tipoDados,
  });
  const avisos = aviso ? [aviso] : [];
  return {
    ok: registros.length >= 3,
    fonteUsada: "ANA",
    registros,
    total: registros.length,
    maximasAnuais: maximasFromRegs(registros),
    avisos,
  };
}

async function importInmet(
  estacao: EstacaoBrasil,
  dataInicio: string,
  dataFim: string,
): Promise<AutoImportResult> {
  let codInmet = estacao.codigoInmet;
  if (!codInmet) {
    codInmet = (await inmetCodigoMaisProximo(estacao.latitude, estacao.longitude)) ?? undefined;
  }
  if (!codInmet) {
    return {
      ok: false,
      fonteUsada: "INMET",
      registros: [],
      total: 0,
      maximasAnuais: [],
      avisos: [
        "INMET: token ou código de estação não configurado (INMET_API_TOKEN).",
      ],
    };
  }

  const { registros, aviso, fonte } = await fetchInmetSerie(codInmet, dataInicio, dataFim);
  const avisos = aviso ? [aviso] : [];
  if (codInmet !== estacao.codigoInmet) {
    avisos.unshift(`Estação INMET automática mais próxima: ${codInmet}`);
  }
  return {
    ok: registros.length >= 3,
    fonteUsada: fonte as FonteHidrologica,
    registros,
    total: registros.length,
    maximasAnuais: maximasFromRegs(registros),
    avisos,
  };
}

/** Importa automaticamente conforme a fonte da estação ou preferência do utilizador. */
export async function autoImportFromSource(
  params: AutoImportParams,
): Promise<AutoImportResult> {
  const { estacao, dataInicio, dataFim } = params;
  const fonte = params.fonte ?? estacao.fonte ?? "ANA";
  const tipoAna: "1" | "2" | "3" =
    params.tipoDadosAna ?? (estacao.tipo === "Fluviometrica" ? "3" : "2");

  const avisos: string[] = [];

  if (fonte === "ANA") {
    const r = await importAna(estacao, dataInicio, dataFim, tipoAna);
    if (r.ok) return r;
    avisos.push(...r.avisos);
    const fallback = await importInmet(estacao, dataInicio, dataFim);
    if (fallback.ok) {
      avisos.push("ANA sem dados — utilizada fonte INMET (fallback).");
      return { ...fallback, avisos: uniqAvisos([...avisos, ...fallback.avisos]) };
    }
    avisos.push(...fallback.avisos);
    return demoFallback(estacao, dataInicio, dataFim, avisos);
  }

  if (fonte === "INMET") {
    const r = await importInmet(estacao, dataInicio, dataFim);
    if (r.ok) return r;
    avisos.push(...r.avisos);
    const fallback = await importAna(estacao, dataInicio, dataFim, tipoAna);
    if (fallback.ok) {
      avisos.push("INMET sem dados — utilizada fonte ANA (fallback).");
      return { ...fallback, avisos: uniqAvisos([...avisos, ...fallback.avisos]) };
    }
    avisos.push(...fallback.avisos);
    return demoFallback(estacao, dataInicio, dataFim, avisos);
  }

  if (fonte === "Manual" || fonte === "CPRM" || fonte === "CEMADEN" || fonte === "DadosAbertos") {
    const ana = await importAna(estacao, dataInicio, dataFim, tipoAna);
    if (ana.ok) {
      avisos.push(`Fonte ${fonte}: dados hidrológicos via ANA (automático).`);
      return { ...ana, avisos: [...avisos, ...ana.avisos] };
    }
    return demoFallback(estacao, dataInicio, dataFim, [
      ...avisos,
      ...ana.avisos,
      "Importe CSV manualmente ou configure fonte ANA/INMET.",
    ]);
  }

  return importAna(estacao, dataInicio, dataFim, tipoAna);
}

function demoFallback(
  estacao: EstacaoBrasil,
  dataInicio: string,
  dataFim: string,
  avisos: string[],
): AutoImportResult {
  const registros = gerarSerieDemo(estacao, dataInicio, dataFim);
  return {
    ok: registros.length >= 3,
    fonteUsada: "Demo",
    registros,
    total: registros.length,
    maximasAnuais: maximasFromRegs(registros),
    avisos: resumirAvisosDemo([
      ...avisos,
      "ANA/INMET indisponíveis — série pluviométrica demo gerada (substitua por CSV real).",
    ]),
  };
}

/**
 * Modelo preditivo de risco de enchente (ensemble heurístico + dados coletados).
 * Estruturado para evolução com ML treinado (séries ANA + contexto informado).
 */

import { acumuladoDias, maxDiariaRecente } from "./daily-series";
import type {
  ContextoEnchenteInformado,
  EstacaoBrasil,
  FatorRiscoEnchente,
  PrevisaoEnchenteInput,
  PrevisaoEnchenteResult,
  RegistroDiarioBr,
} from "./types";

const MODELO_ID = "datageo-flood-ensemble-v1";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function fator(
  id: string,
  label: string,
  peso: number,
  valor: number,
): FatorRiscoEnchente {
  const v = clamp01(valor);
  return {
    id,
    label,
    peso,
    valor: v,
    contribuicao: peso * v,
  };
}

function nivelFromScore(score: number): PrevisaoEnchenteResult["nivel"] {
  if (score >= 75) return "critico";
  if (score >= 55) return "alto";
  if (score >= 32) return "moderado";
  return "baixo";
}

function recomendacoes(
  nivel: PrevisaoEnchenteResult["nivel"],
  ctx?: ContextoEnchenteInformado,
): string[] {
  const out: string[] = [];
  if (nivel === "critico" || nivel === "alto") {
    out.push("Acionar plano de contingência e monitorar cotas/vazões a montante.");
    out.push("Evitar áreas baixas e cruzamentos de córregos até estabilização.");
  }
  if (nivel === "moderado") {
    out.push("Reforçar monitoramento nas próximas 24–72 h.");
  }
  if (ctx?.alertaOficial && ctx.alertaOficial !== "nenhum") {
    out.push(`Considerar alerta oficial já informado: ${ctx.alertaOficial}.`);
  }
  if (ctx?.observacoes?.trim()) {
    out.push(`Contexto local: ${ctx.observacoes.trim()}`);
  }
  if (!out.length) {
    out.push("Risco baixo no cenário atual; manter coleta de dados e revisão diária.");
  }
  return out;
}

export function preverEnchente(input: PrevisaoEnchenteInput): PrevisaoEnchenteResult {
  const { estacao, serieDiaria, contexto } = input;
  const p1Tr10 = input.p1diaTr10Mm ?? 80;
  const i1h = input.i1hTr10MmH ?? 60;

  const p24 = maxDiariaRecente(serieDiaria, 1);
  const p7 = acumuladoDias(serieDiaria, 7);
  const p30 = acumuladoDias(serieDiaria, 30);

  const ratioP24 = p1Tr10 > 0 ? p24 / p1Tr10 : 0;
  const ratioP7 = p1Tr10 > 0 ? p7 / (p1Tr10 * 2.5) : 0;
  const ratioP30 = p1Tr10 > 0 ? p30 / (p1Tr10 * 5) : 0;

  const sat = contexto?.saturacaoSolo ?? Math.min(1, p30 / Math.max(50, p1Tr10 * 4));
  const imper = contexto?.impermeabilizacao ?? 0.35;
  const area = estacao.areaDrenagemKm2 ?? 500;
  const areaFactor = clamp01(Math.log10(Math.max(10, area)) / 4);

  const alertaMap: Record<string, number> = {
    nenhum: 0,
    atenção: 0.35,
    atencao: 0.35,
    alerta: 0.65,
    emergência: 0.9,
    emergencia: 0.9,
  };
  const alerta =
    alertaMap[(contexto?.alertaOficial ?? "nenhum").toLowerCase()] ?? 0;

  const pop =
    contexto?.populacaoRisco != null && contexto.populacaoRisco > 0
      ? clamp01(Math.log10(contexto.populacaoRisco + 1) / 5)
      : 0.2;

  const contencao = contexto?.contencaoMontante ? 0.15 : 0;

  const fatores: FatorRiscoEnchente[] = [
    fator("p24", "Chuva 24 h vs. P₁dia TR=10", 0.22, ratioP24),
    fator("p7", "Acumulado 7 dias", 0.18, ratioP7),
    fator("p30", "Acumulado 30 dias / saturação", 0.14, ratioP30),
    fator("sat", "Saturação do solo (informada/calculada)", 0.12, sat),
    fator("imper", "Impermeabilização urbana", 0.1, imper),
    fator("idf", "Intensidade 1 h (TR=10) normalizada", 0.08, i1h / 120),
    fator("area", "Área de drenagem", 0.08, areaFactor),
    fator("alerta", "Alerta oficial informado", 0.1, alerta),
    fator("pop", "Exposição populacional", 0.06, pop),
    fator("tipo", "Estação fluviométrica (proxy de vazão)", 0.02, estacao.tipo === "Fluviometrica" ? 0.7 : 0.3),
  ];

  let scoreRaw = fatores.reduce((s, f) => s + f.contribuicao, 0) * 100;
  scoreRaw -= contencao * 12;
  const score = Math.round(clamp01(scoreRaw / 100) * 100);

  const z = (score - 45) / 18;
  const prob24 = Math.round(sigmoid(z + (ratioP24 - 0.5) * 2) * 100);
  const prob72 = Math.round(
    clamp01(sigmoid(z + 0.4 + ratioP7 * 0.8) * 1.05) * 100,
  );

  const nivel = nivelFromScore(score);

  return {
    score,
    nivel,
    probabilidade24h: prob24,
    probabilidade72h: prob72,
    fatores,
    recomendacoes: recomendacoes(nivel, contexto),
    modelo: MODELO_ID,
    geradoEm: new Date().toISOString(),
  };
}

/** Executa previsão com série mínima (últimos registos). */
export function preverEnchenteFromSerie(
  estacao: EstacaoBrasil,
  serie: RegistroDiarioBr[],
  opts?: {
    p1diaTr10Mm?: number;
    i1hTr10MmH?: number;
    contexto?: ContextoEnchenteInformado;
  },
): PrevisaoEnchenteResult | null {
  if (serie.length < 3) return null;
  return preverEnchente({
    estacao,
    serieDiaria: serie,
    p1diaTr10Mm: opts?.p1diaTr10Mm,
    i1hTr10MmH: opts?.i1hTr10MmH,
    contexto: opts?.contexto,
  });
}

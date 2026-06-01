import type { LineQcMetrics, QcGrade, SurveyQcReport } from "../qc/qc-types";
import { QC_GRADE_COLORS } from "../qc/qc-types";
import { isGeophysAiAvailable } from "./geophys-interpret-ai";

export type QcAiResult = {
  summary: string;
  lineInterpretations: {
    lineId: string;
    lineName: string;
    grade: QcGrade;
    noiseOrigin: string;
    reliability: string;
    recommendations: string[];
  }[];
  overallReliability: string;
};

function ruleBasedQcAi(report: SurveyQcReport): QcAiResult {
  const lineInterpretations = report.lines.map((line) => ({
    lineId: line.lineId,
    lineName: line.lineName,
    grade: line.grade,
    noiseOrigin: inferNoiseOrigin(line),
    reliability: inferReliability(line),
    recommendations: inferRecommendations(line),
  }));

  const overallReliability =
    report.overallGrade === "green"
      ? "Alta confiabilidade para inversão e interpretação."
      : report.overallGrade === "yellow"
        ? "Confiabilidade moderada — revisar pontos amarelos/vermelhos antes da inversão."
        : "Baixa confiabilidade — recomenda-se repetir aquisição ou filtrar ruído.";

  return {
    summary: `Campanha com ${report.lines.length} linha(s). Score médio ${report.overallQualityScore.toFixed(0)}/100 · SNR ${report.overallSnr.toFixed(1)} · coerência ${(report.spatialCoherence * 100).toFixed(0)}%. Classificação: ${QC_GRADE_COLORS[report.overallGrade].label}.`,
    lineInterpretations,
    overallReliability,
  };
}

function inferNoiseOrigin(line: LineQcMetrics): string {
  const parts: string[] = [];
  if (line.powerLine50 > 0.15) parts.push("coupling 50 Hz (rede elétrica)");
  if (line.powerLine60 > 0.15) parts.push("coupling 60 Hz");
  if (line.spikeRatio > 0.08) parts.push("spikes pontuais (contato/eletrodo)");
  if (line.spectralNoiseIndex > 0.45) parts.push("ruído espectral de alta frequência");
  if (line.maxAbruptChange > 0.35) parts.push("variações abruptas ao longo do perfil");
  if (line.stabilityCv > 0.8) parts.push("instabilidade de amplitude");
  if (parts.length === 0) {
    return line.grade === "green"
      ? "Sinal limpo, sem origem de ruído dominante identificada."
      : "Ruído incoerente — verificar contato, CEM e condições de campo.";
  }
  return `Provável origem: ${parts.join("; ")}.`;
}

function inferReliability(line: LineQcMetrics): string {
  if (line.grade === "green") {
    return "Linha confiável para inversão 2D/3D e interpretação geológica.";
  }
  if (line.grade === "yellow") {
    return "Utilizável com cautela; aplicar filtros e excluir spikes antes da inversão.";
  }
  return "Baixa confiabilidade — repetir levantamento ou excluir trechos ruidosos.";
}

function inferRecommendations(line: LineQcMetrics): string[] {
  const rec: string[] = [];
  if (line.spikeCount > 0) {
    rec.push(`Excluir ou interpolar ${line.spikeCount} spike(s) detectado(s).`);
  }
  if (line.powerLine50 > 0.1 || line.powerLine60 > 0.1) {
    rec.push("Aplicar notch 50/60 Hz se série V/I disponível; verificar aterramento.");
  }
  if (line.snr < 4) {
    rec.push("Considerar aumentar stackings ou reduzir comprimento n.");
  }
  if (rec.length === 0) {
    rec.push("Manter parâmetros de aquisição; dados aptos para modelagem.");
  }
  return rec;
}

export async function enhanceQcWithOpenAI(
  report: SurveyQcReport,
): Promise<QcAiResult> {
  const fallback = ruleBasedQcAi(report);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return fallback;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const system = `Você é especialista em QC de dados geofísicos (ERT/resistividade).
Analise métricas SNR, spikes, ruído 50/60Hz, coerência espacial.
Responda JSON:
{
  "summary": "string",
  "overallReliability": "string",
  "lineInterpretations": [{
    "lineId": "string",
    "lineName": "string",
    "grade": "green|yellow|red",
    "noiseOrigin": "string",
    "reliability": "string",
    "recommendations": ["string"]
  }]
}
Português brasileiro, linguagem técnica geofísica.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(report, null, 2) },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as QcAiResult;
    if (!parsed.summary) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export { isGeophysAiAvailable, ruleBasedQcAi };

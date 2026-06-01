import type { TemporalAiResult } from "../temporal-types";
import type { TemporalChangeAnalysis } from "../temporal-types";
import { isGeophysAiAvailable } from "@/lib/geofisica/ai/geophys-interpret-ai";
import { ruleBasedDetections } from "./temporal-ai-detector";

export type TemporalInterpretInput = {
  change: TemporalChangeAnalysis;
  ai: TemporalAiResult;
  locationLabel?: string;
};

export type TemporalInterpretResult = {
  narrative: string;
  recommendations: string[];
  riskLevel: "low" | "medium" | "high";
};

export function ruleBasedTemporalInterpret(
  input: TemporalInterpretInput,
): TemporalInterpretResult {
  const { change, ai } = input;
  const highConf = ai.detections.filter((d) => d.confidence > 0.65);
  const riskLevel =
    change.changePct > 25 || highConf.length >= 3
      ? "high"
      : change.changePct > 10 || highConf.length >= 1
        ? "medium"
        : "low";

  const recommendations: string[] = [];
  if (change.index === "ndvi" && change.changePct > 12) {
    recommendations.push("Validar alteração de cobertura vegetal em campo ou drone.");
  }
  if (
    ai.detections.some((d) => d.target === "mineralization" && d.confidence > 0.6)
  ) {
    recommendations.push("Correlacionar com geologia regional (GeoSGB) e geofísica.");
  }
  if (
    ai.detections.some((d) => d.target === "slope_movement" && d.confidence > 0.55)
  ) {
    recommendations.push("Integrar com monitoramento de taludes / InSAR se disponível.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Manter série temporal; repetir comparação após nova aquisição.");
  }

  return {
    narrative: `${input.locationLabel ?? "Área de estudo"}: comparação ${change.dateA}–${change.dateB} (${change.index}). ${ai.summary}`,
    recommendations,
    riskLevel,
  };
}

export async function enhanceTemporalWithOpenAI(
  input: TemporalInterpretInput,
): Promise<TemporalInterpretResult> {
  const base = ruleBasedTemporalInterpret(input);
  if (!isGeophysAiAvailable()) return base;

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return base;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Geólogo remoto especialista em sensoriamento temporal. Responda em português, JSON: { narrative, recommendations: string[], riskLevel: low|medium|high }.",
          },
          {
            role: "user",
            content: JSON.stringify({
              change: input.change,
              detections: input.ai.detections,
            }),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return base;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) return base;
    const parsed = JSON.parse(text) as TemporalInterpretResult;
    return { ...base, ...parsed };
  } catch {
    return base;
  }
}

export { ruleBasedDetections };

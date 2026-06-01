/**
 * Interpretação IA de volume 3D geofísico (zonas condutivas, fraturas, alteração, mineralização).
 */

import { isGeophysAiAvailable } from "./geophys-interpret-ai";

export type VolumeAiInput = {
  lat: number;
  lng: number;
  lineCount: number;
  logRhoMin: number;
  logRhoMax: number;
  logRhoMean: number;
  depthMaxM: number;
  method: string;
  regionSummary?: string;
};

export type VolumeAiFinding = {
  id: string;
  type:
    | "conductive_zone"
    | "fracture"
    | "altered_rock"
    | "mineralization"
    | "general";
  label: string;
  description: string;
  confidence: number;
  depthMinM?: number;
  depthMaxM?: number;
};

export type VolumeAiResult = {
  summary: string;
  findings: VolumeAiFinding[];
  recommendations: string[];
};

export { isGeophysAiAvailable };

function ruleBasedInterpretation(input: VolumeAiInput): VolumeAiResult {
  const rhoMean = 10 ** input.logRhoMean;
  const findings: VolumeAiFinding[] = [];

  if (input.logRhoMean < 1.5) {
    findings.push({
      id: "c1",
      type: "conductive_zone",
      label: "Zona condutiva",
      description: `Resistividade média ~${rhoMean.toFixed(0)} Ω·m compatível com argila saturada, silte ou água subterrânea.`,
      confidence: 0.72,
      depthMinM: 0,
      depthMaxM: input.depthMaxM * 0.6,
    });
  }

  if (input.logRhoMean > 2.8) {
    findings.push({
      id: "r1",
      type: "altered_rock",
      label: "Corpo resistivo",
      description: `Resistividade média ~${rhoMean.toFixed(0)} Ω·m sugere rocha fresca, cascalho ou afloramento resistivo.`,
      confidence: 0.65,
    });
  }

  findings.push({
    id: "f1",
    type: "fracture",
    label: "Anomalias lineares",
    description:
      "Verifique alinhamentos entre secções paralelas — contrastes alongados podem indicar falhas ou fraturas.",
    confidence: 0.45,
  });

  return {
    summary: `Volume ${input.lineCount} linhas ERT, interpolação ${input.method}. Faixa log₁₀(ρ): ${input.logRhoMin.toFixed(2)}–${input.logRhoMax.toFixed(2)}.`,
    findings,
    recommendations: [
      "Correlacionar zonas condutivas com mapa geológico CPRM/GeoSGB.",
      "Validar anomalias com sondagem ou poço de verificação.",
      "Comparar fatias horizontais em profundidades de 5, 10 e 20 m.",
    ],
  };
}

export async function enhanceVolumeWithOpenAI(
  input: VolumeAiInput,
): Promise<VolumeAiResult> {
  const fallback = ruleBasedInterpretation(input);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return fallback;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const system = `Você é geofísico especialista em ERT/resistividade no Brasil.
Analise um volume 3D pseudo-georreferenciado e responda em JSON:
{
  "summary": "string",
  "findings": [{"id":"string","type":"conductive_zone|fracture|altered_rock|mineralization|general","label":"string","description":"string","confidence":0-1,"depthMinM":number|null,"depthMaxM":number|null}],
  "recommendations": ["string"]
}
Identifique: zonas condutivas (argila/água), fraturas/falhas, rocha alterada, possíveis corpos mineralizados (alta condutividade + contexto).
Use linguagem técnica em português brasileiro.`;

  const user = JSON.stringify(input, null, 2);

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
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as VolumeAiResult;
    if (!parsed.summary || !Array.isArray(parsed.findings)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

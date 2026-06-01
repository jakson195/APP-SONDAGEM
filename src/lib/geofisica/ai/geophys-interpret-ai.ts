import type {
  InvertCellSummary,
  RegionalGeologyProfile,
} from "@/lib/geofisica/dipolo2d/interpret-types";
import {
  inferResistivityNormProfile,
  mergeAiResistivityNorm,
  normProfileToMaterials,
} from "@/lib/geofisica/dipolo2d/resistivity-norms-br";

export function isGeophysAiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function openAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

async function chatJson(
  system: string,
  user: string,
  temperature = 0.3,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel(),
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? null;
}

function parseRegionalFromAiJson(
  raw: string,
  fallback: RegionalGeologyProfile,
  lat: number,
  lng: number,
): RegionalGeologyProfile | null {
  try {
    const j = JSON.parse(raw) as {
      regionName?: string;
      province?: string;
      summary?: string;
      formations?: string[];
      materials?: Array<{
        id?: string;
        nome?: string;
        cor?: string;
        rhoMinOhmM?: number;
        rhoMaxOhmM?: number;
        prior?: number;
      }>;
      resistivityClasses?: Array<{
        id?: string;
        label?: string;
        rhoMinOhmM?: number;
        rhoMaxOhmM?: number;
        notes?: string;
      }>;
      resistivitySummary?: string;
    };
    if (!j.summary || !Array.isArray(j.materials) || j.materials.length === 0) {
      return null;
    }

    const baseNorm =
      fallback.resistivityNorm ?? inferResistivityNormProfile(lat, lng);
    const resistivityNorm = mergeAiResistivityNorm(baseNorm, {
      classes: j.resistivityClasses,
      summary: j.resistivitySummary,
    });
    const normMaterials = normProfileToMaterials(resistivityNorm);

    return {
      regionName: j.regionName ?? fallback.regionName,
      province: j.province ?? fallback.province,
      summary: [j.summary, j.resistivitySummary].filter(Boolean).join(" "),
      formations: Array.isArray(j.formations)
        ? j.formations.filter((f) => typeof f === "string")
        : fallback.formations,
      materials: [
        ...normMaterials,
        ...j.materials
          .filter((m) => m.nome && m.rhoMinOhmM != null && m.rhoMaxOhmM != null)
          .map((m, idx) => ({
            id: m.id ?? `ai_${idx}`,
            nome: m.nome!,
            cor: m.cor ?? "#94a3b8",
            rhoMinOhmM: Math.max(0.5, m.rhoMinOhmM!),
            rhoMaxOhmM: Math.max(m.rhoMinOhmM! * 1.1, m.rhoMaxOhmM!),
            prior: Math.min(1, Math.max(0.1, m.prior ?? 0.6)),
          })),
      ],
      mapUnits: fallback.mapUnits,
      dataSources: [
        ...fallback.dataSources,
        ...(fallback.dataSources.includes("OpenAI") ? [] : ["OpenAI (refino)"]),
      ],
      source: "ai",
      anchorLat: fallback.anchorLat,
      anchorLng: fallback.anchorLng,
      resistivityNorm,
    };
  } catch {
    return null;
  }
}

/** Refina perfil regional (materiais, faixas ρ) com CPRM/GeoSGB no contexto. */
export async function enhanceRegionalWithOpenAI(
  base: RegionalGeologyProfile,
  lat: number,
  lng: number,
  cellSummary: InvertCellSummary | null | undefined,
): Promise<RegionalGeologyProfile> {
  if (!isGeophysAiAvailable()) return base;

  const mapLines = base.mapUnits
    .map(
      (u) =>
        `[${u.source}] ${u.sigla ? `${u.sigla}: ` : ""}${u.name}${u.lithology ? ` (${u.lithology})` : ""}${u.age ? `, ${u.age}` : ""}`,
    )
    .join("\n");

  const cellLine = cellSummary
    ? `Modelo invertido: ρ ${cellSummary.rhoMinOhmM.toFixed(0)}–${cellSummary.rhoMaxOhmM.toFixed(0)} Ω·m (mediana ${cellSummary.rhoMedianOhmM.toFixed(0)}), prof. ~${cellSummary.depthMaxM.toFixed(0)} m.`
    : "";

  const prompt = `Geólogo brasileiro — interpretação ERT (dipolo-dipolo).
Coordenadas: lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}
Fontes consultadas: ${base.dataSources.join("; ")}

UNIDADES CARTOGRÁFICAS NO PONTO:
${mapLines || "(nenhuma)"}

${base.summary}

Formações: ${base.formations.join("; ")}
${cellLine}

Classificação normativa ERT (referência BR — Loke/Reynolds/CPRM):
- argila: 0–500 Ω·m
- rocha_alterada: 500–1500 Ω·m
- rocha_sa: 1500–10000 Ω·m
Ajuste os limites apenas se a geologia regional (Barreiras, Serra Geral, etc.) exigir; mantenha as três classes.

Com base nas unidades CPRM/Macrostrat, refine materiais e faixas de ρ para o perfil invertido.
Responda APENAS JSON:
{
  "regionName": string,
  "province": string,
  "summary": string (3-5 frases, cite unidades do mapa),
  "formations": string[],
  "materials": [{ "id", "nome", "cor" (hex), "rhoMinOhmM", "rhoMaxOhmM", "prior" (0-1) }],
  "resistivityClasses": [
    { "id": "argila"|"rocha_alterada"|"rocha_sa", "label", "rhoMinOhmM", "rhoMaxOhmM", "notes" }
  ],
  "resistivitySummary": string (1 frase sobre ajuste regional das faixas)
}
Inclua sempre as 3 resistivityClasses; 4-10 materiais litológicos adicionais com prior regional.`;

  const content = await chatJson(
    "JSON apenas. Português. Use dados CPRM/Macrostrat fornecidos; não invente formações ausentes no ponto.",
    prompt,
  );
  if (!content) return { ...base, source: base.source === "rules" ? "hybrid" : base.source };

  const parsed = parseRegionalFromAiJson(content, base, lat, lng);
  if (!parsed) return { ...base, source: "hybrid" };
  return parsed;
}

export type SectionAiInput = {
  lat: number;
  lng: number;
  regional: RegionalGeologyProfile;
  cellSummary: InvertCellSummary | null;
  baseNarrative: string;
  layerUnits: Array<{
    id: number;
    label: string;
    material: string;
    meanRhoOhmM: number;
    cellCount: number;
  }>;
  representativeLayers: Array<{
    topo: number;
    base: number;
    material: string;
  }>;
  contacts: Array<{ layerAbove: string; layerBelow: string }>;
};

export type SectionAiResult = {
  narrative: string;
  /** id da camada → nome litostratigráfico sugerido */
  layerMaterials: Record<number, string>;
  fieldNotes: string;
  confidence: "alta" | "media" | "baixa";
};

export async function enhanceSectionWithOpenAI(
  input: SectionAiInput,
): Promise<SectionAiResult | null> {
  if (!isGeophysAiAvailable()) return null;

  const { regional, lat, lng, cellSummary, baseNarrative } = input;
  const mapLines = regional.mapUnits
    .slice(0, 12)
    .map((u) => `${u.sigla ?? ""} ${u.name}${u.lithology ? ` — ${u.lithology}` : ""}`)
    .join("\n");

  const layersTxt = input.layerUnits
    .map(
      (u) =>
        `id=${u.id} ${u.label}: ${u.material}, ρ̄≈${u.meanRhoOhmM.toFixed(0)} Ω·m, ${u.cellCount} células`,
    )
    .join("\n");

  const colTxt = input.representativeLayers
    .map((L) => `${L.topo.toFixed(1)}–${L.base.toFixed(1)} m: ${L.material}`)
    .join("\n");

  const contactsTxt = input.contacts
    .slice(0, 8)
    .map((c) => `${c.layerAbove} / ${c.layerBelow}`)
    .join("\n");

  const cellLine = cellSummary
    ? `ρ ${cellSummary.rhoMinOhmM.toFixed(0)}–${cellSummary.rhoMaxOhmM.toFixed(0)} Ω·m, mediana ${cellSummary.rhoMedianOhmM.toFixed(0)}, prof. ${cellSummary.depthMaxM.toFixed(0)} m.`
    : "";

  const prompt = `Interpretação geofísica ERT 2D (dipolo-dipolo), Brasil.
Ponto: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°
Região: ${regional.regionName}
${regional.summary}

Unidades cartográficas (GeoSGB/CPRM — usar como verdade, não inventar):
${mapLines || "(sem unidades no ponto)"}

Modelo invertido: ${cellLine}

Camadas detectadas na secção (por resistividade):
${layersTxt}

Coluna central:
${colTxt}

Contatos:
${contactsTxt || "(nenhum destacado)"}

Narrativa automática atual:
${baseNarrative}

Tarefa: redigir interpretação técnica em português (relatório de campo), correlacionando ρ com litologia regional.
Responda APENAS JSON:
{
  "narrative": string (4-8 frases, cite formações CPRM quando aplicável),
  "layerMaterials": [{ "layerId": number, "material": string }],
  "fieldNotes": string (1-2 frases: validação recomendada — sondagem, testemunho),
  "confidence": "alta"|"media"|"baixa"
}
layerMaterials: renomear camadas com nomes litostratigráficos plausíveis (sigla CPRM + litologia); manter coerência com ρ.`;

  const content = await chatJson(
    "JSON apenas. Português técnico. Não invente unidades geológicas ausentes no ponto. ERT é modelo interpretativo — deixe explícito.",
    prompt,
    0.35,
  );
  if (!content) return null;

  try {
    const j = JSON.parse(content) as {
      narrative?: string;
      layerMaterials?: Array<{ layerId?: number; material?: string }>;
      fieldNotes?: string;
      confidence?: string;
    };
    if (!j.narrative?.trim()) return null;

    const layerMaterials: Record<number, string> = {};
    for (const row of j.layerMaterials ?? []) {
      if (
        typeof row.layerId === "number" &&
        row.material?.trim() &&
        Number.isFinite(row.layerId)
      ) {
        layerMaterials[row.layerId] = row.material.trim();
      }
    }

    const conf =
      j.confidence === "alta" || j.confidence === "baixa"
        ? j.confidence
        : "media";

    return {
      narrative: j.narrative.trim(),
      layerMaterials,
      fieldNotes: j.fieldNotes?.trim() ?? "",
      confidence: conf,
    };
  } catch {
    return null;
  }
}

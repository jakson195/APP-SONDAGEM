import {
  enhanceVolumeWithOpenAI,
  isGeophysAiAvailable,
  type VolumeAiInput,
} from "@/lib/geofisica/ai/volume-interpret-ai";

export type VolumeInterpretFinding = {
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

export type VolumeInterpretResult = {
  summary: string;
  findings: VolumeInterpretFinding[];
  recommendations: string[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VolumeAiInput;
    const result = await enhanceVolumeWithOpenAI(body);
    return Response.json({
      ok: true,
      interpretation: result,
      aiAvailable: isGeophysAiAvailable(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na interpretação 3D";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

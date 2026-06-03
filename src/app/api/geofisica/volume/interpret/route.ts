import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import {
  enhanceVolumeWithOpenAI,
  isGeophysAiAvailable,
  type VolumeAiInput,
} from "@/lib/geofisica/ai/volume-interpret-ai";

export const dynamic = "force-dynamic";

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

async function handleVolumeInterpret(req: Request) {
  try {
    const body = (await req.json()) as VolumeAiInput;
    const result = await enhanceVolumeWithOpenAI(body);
    return NextResponse.json({
      ok: true,
      interpretation: result,
      aiAvailable: isGeophysAiAvailable(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na interpretação 3D";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return withGeophysicsApi(req, async (_ctx, r) => handleVolumeInterpret(r), {
    allowGlobalScope: true,
  });
}

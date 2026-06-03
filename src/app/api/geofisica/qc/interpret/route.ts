import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import {
  enhanceQcWithOpenAI,
  isGeophysAiAvailable,
} from "@/lib/geofisica/ai/qc-interpret-ai";
import type { SurveyQcReport } from "@/lib/geofisica/qc/qc-types";

export const dynamic = "force-dynamic";

async function handleQcInterpret(req: Request) {
  try {
    const report = (await req.json()) as SurveyQcReport;
    const interpretation = await enhanceQcWithOpenAI(report);
    return NextResponse.json({
      ok: true,
      interpretation,
      aiAvailable: isGeophysAiAvailable(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro QC IA";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return withGeophysicsApi(req, async (_ctx, r) => handleQcInterpret(r), {
    allowGlobalScope: true,
  });
}

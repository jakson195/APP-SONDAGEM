import { NextResponse } from "next/server";
import {
  enhanceTemporalWithOpenAI,
  ruleBasedTemporalInterpret,
} from "@/lib/geo/temporal/ai/temporal-interpret-ai";
import { ruleBasedDetections } from "@/lib/geo/temporal/ai/temporal-ai-detector";
import type {
  TemporalAiTarget,
  TemporalChangeAnalysis,
  Wgs84Bbox,
} from "@/lib/geo/temporal/temporal-types";
import { DEFAULT_TEMPORAL_BBOX } from "@/lib/geo/temporal/temporal-types";
import { isGeophysAiAvailable } from "@/lib/geofisica/ai/geophys-interpret-ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      change: TemporalChangeAnalysis;
      bbox?: Wgs84Bbox;
      targets?: TemporalAiTarget[];
      useOpenAi?: boolean;
    };

    const bbox = body.bbox ?? DEFAULT_TEMPORAL_BBOX;
    const targets: TemporalAiTarget[] = body.targets ?? [
      "geological_alteration",
      "vegetation_change",
      "erosion_expansion",
    ];

    const ai = ruleBasedDetections({
      change: body.change,
      bbox,
      targets,
    });

    const interpretInput = {
      change: body.change,
      ai,
      locationLabel: "Área de estudo",
    };

    const interpretation = body.useOpenAi
      ? await enhanceTemporalWithOpenAI(interpretInput)
      : ruleBasedTemporalInterpret(interpretInput);

    return NextResponse.json({
      ok: true,
      ai,
      interpretation,
      aiAvailable: isGeophysAiAvailable(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interpretação temporal";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

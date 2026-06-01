import { NextResponse } from "next/server";
import {
  requestGeeVisualization,
  isGeeConfigured,
} from "@/lib/geo/temporal/providers/gee-provider";
import type { SpectralIndex, Wgs84Bbox } from "@/lib/geo/temporal/temporal-types";
import { DEFAULT_TEMPORAL_BBOX } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      bbox?: Wgs84Bbox;
      date?: string;
      index?: SpectralIndex;
    };

    const result = await requestGeeVisualization({
      bbox: body.bbox ?? DEFAULT_TEMPORAL_BBOX,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      index: body.index ?? "ndvi",
    });

    return NextResponse.json({
      ...result,
      configured: isGeeConfigured(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro GEE";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

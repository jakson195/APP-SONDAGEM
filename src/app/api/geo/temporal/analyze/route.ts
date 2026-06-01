import { NextResponse } from "next/server";
import {
  buildSyntheticIndexGrid,
  computeChangeAnalysis,
} from "@/lib/geo/temporal/change-detection";
import type {
  SpectralIndex,
  Wgs84Bbox,
} from "@/lib/geo/temporal/temporal-types";
import { DEFAULT_TEMPORAL_BBOX } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      dateA: string;
      dateB: string;
      index?: SpectralIndex;
      bbox?: Wgs84Bbox;
      nx?: number;
      ny?: number;
    };

    const bbox = body.bbox ?? DEFAULT_TEMPORAL_BBOX;
    const index = body.index ?? "ndvi";
    const nx = Math.min(64, Math.max(16, body.nx ?? 32));
    const ny = Math.min(64, Math.max(16, body.ny ?? 32));

    const seedA = hashDate(body.dateA);
    const seedB = hashDate(body.dateB);

    const gridA = buildSyntheticIndexGrid(bbox, nx, ny, index, seedA);
    const gridB = buildSyntheticIndexGrid(bbox, nx, ny, index, seedB);

    const change = computeChangeAnalysis(
      gridA,
      gridB,
      body.dateA,
      body.dateB,
      index,
    );

    return NextResponse.json({ ok: true, change });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro análise temporal";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function hashDate(d: string): number {
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0;
  return Math.abs(h);
}

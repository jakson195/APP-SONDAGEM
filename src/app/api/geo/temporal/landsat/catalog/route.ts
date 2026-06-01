import { NextResponse } from "next/server";
import {
  isLandsatEngineConfigured,
  landsatEngineUrl,
  searchLandsatEngineCatalog,
} from "@/lib/geo/temporal/landsat-engine-client";
import type { Wgs84Bbox } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";

type Body = {
  bbox?: Wgs84Bbox;
  dateFrom?: string;
  dateTo?: string;
  maxCloudPct?: number;
  limit?: number;
};

export async function POST(req: Request) {
  if (!isLandsatEngineConfigured()) {
    return NextResponse.json(
      { ok: false, error: "LANDSAT_ENGINE_URL não configurado" },
      { status: 503 },
    );
  }
  try {
    const body = (await req.json()) as Body;
    if (!body.bbox || !body.dateFrom || !body.dateTo) {
      return NextResponse.json(
        { ok: false, error: "bbox, dateFrom e dateTo são obrigatórios" },
        { status: 400 },
      );
    }
    const catalog = await searchLandsatEngineCatalog({
      bbox: body.bbox,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      maxCloudPct: body.maxCloudPct,
      limit: body.limit,
    });
    return NextResponse.json({
      ok: true,
      engine: landsatEngineUrl(),
      ...catalog,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro catálogo Landsat engine";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${landsatEngineUrl()}/api/v1/landsat/catalog/example/garuva`, {
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json();
    return NextResponse.json({ ok: true, example: json });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Engine indisponível";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

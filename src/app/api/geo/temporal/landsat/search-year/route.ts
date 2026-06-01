import { NextResponse } from "next/server";
import { landsatEngineUrl } from "@/lib/geo/temporal/landsat-engine-client";
import type { Wgs84Bbox } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";

type Body = {
  bbox?: Wgs84Bbox;
  year?: number;
  maxCloudPct?: number;
  limit?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.bbox || body.year == null) {
      return NextResponse.json(
        { ok: false, error: "bbox e year são obrigatórios" },
        { status: 400 },
      );
    }
    const res = await fetch(
      `${landsatEngineUrl()}/api/v1/landsat/catalog/search-year`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bbox: body.bbox,
          year: body.year,
          max_cloud_pct: body.maxCloudPct ?? 45,
          limit: body.limit ?? 30,
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: json.detail ?? "STAC search failed" },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true, ...json });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro STAC";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

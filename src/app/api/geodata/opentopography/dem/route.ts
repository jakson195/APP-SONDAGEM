import { NextResponse } from "next/server";
import { landsatEngineUrl } from "@/lib/geo/temporal/landsat-engine-client";
import type { Wgs84Bbox } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = Wgs84Bbox & { demType?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (
      body.west == null ||
      body.south == null ||
      body.east == null ||
      body.north == null
    ) {
      return NextResponse.json({ ok: false, error: "bbox inválido" }, { status: 400 });
    }
    const res = await fetch(`${landsatEngineUrl()}/api/v1/landsat/elevation/dem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        west: body.west,
        south: body.south,
        east: body.east,
        north: body.north,
        dem_type: body.demType ?? "COP30",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { ok: false, error: err.slice(0, 400) },
        { status: res.status },
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/tiff",
        "Content-Disposition": 'attachment; filename="dem-opentopography.tif"',
        "X-Datageo-Source": "opentopography",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro OpenTopography";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${landsatEngineUrl()}/api/v1/landsat/elevation/dem-types`, {
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json();
    return NextResponse.json({ ok: true, ...json });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Engine indisponível";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

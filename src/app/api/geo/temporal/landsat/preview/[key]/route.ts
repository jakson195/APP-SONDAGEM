import { NextResponse } from "next/server";
import { landsatEngineUrl } from "@/lib/geo/temporal/landsat-engine-client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

export async function GET(req: Request, { params }: Params) {
  const { key } = await params;
  const url = new URL(req.url);
  const spectralMode = url.searchParams.get("spectral_mode") ?? "rgb";
  const engineUrl = `${landsatEngineUrl()}/api/v1/landsat/imagery/preview/${encodeURIComponent(key)}.png?spectral_mode=${spectralMode}`;

  try {
    const res = await fetch(engineUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Preview ${res.status}` },
        { status: res.status },
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview indisponível";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

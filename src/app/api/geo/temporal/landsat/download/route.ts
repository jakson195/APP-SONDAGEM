import { NextResponse } from "next/server";
import {
  downloadLandsatEngineScene,
  isLandsatEngineConfigured,
} from "@/lib/geo/temporal/landsat-engine-client";
import type { SpectralIndex, Wgs84Bbox } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  bbox?: Wgs84Bbox;
  date?: string;
  sceneId?: string;
  stacItemUrl?: string;
  spectralMode?: SpectralIndex;
};

export async function POST(req: Request) {
  if (!isLandsatEngineConfigured()) {
    return NextResponse.json(
      { ok: false, error: "LANDSAT_ENGINE_URL não configurado (porta 8093)" },
      { status: 503 },
    );
  }
  try {
    const body = (await req.json()) as Body;
    if (!body.bbox || !body.date) {
      return NextResponse.json(
        { ok: false, error: "bbox e date são obrigatórios" },
        { status: 400 },
      );
    }
    const result = await downloadLandsatEngineScene({
      bbox: body.bbox,
      date: body.date,
      sceneId: body.sceneId,
      stacItemUrl: body.stacItemUrl,
      spectralMode: body.spectralMode ?? "rgb",
    });
    const safeKey = result.scene_id.replace(/\//g, "_").replace(/:/g, "_");
    const { ok: _engineOk, ...rest } = result;
    return NextResponse.json({
      ...rest,
      ok: true,
      previewProxyUrl: `/api/geo/temporal/landsat/preview/${encodeURIComponent(safeKey)}?spectral_mode=${result.spectral_mode}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro download Landsat";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

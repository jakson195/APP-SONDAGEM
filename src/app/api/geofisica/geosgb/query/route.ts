import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import { queryGeosgbPoint } from "@/lib/geofisica/geodata/geosgb-client";

export const dynamic = "force-dynamic";

/**
 * Consulta pontual GeoSGB/CPRM (proxy servidor — inclui HTTP legado CPRM).
 * GET ?lat=&lng=&httpsOnly=1&layers=id1,id2
 */
async function handleGeosgbQueryGet(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { ok: false, error: "Parâmetros lat e lng obrigatórios." },
      { status: 400 },
    );
  }

  const httpsOnly = searchParams.get("httpsOnly") === "1";
  const layersParam = searchParams.get("layers");
  const layerIds = layersParam
    ? layersParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const result = await queryGeosgbPoint(lat, lng, {
      httpsOnly,
      layerIds,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro GeoSGB";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return withGeophysicsApi(req, async (_ctx, r) => handleGeosgbQueryGet(r), {
    allowGlobalScope: true,
  });
}

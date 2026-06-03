import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import { isGeophysAiAvailable } from "@/lib/geofisica/ai/geophys-interpret-ai";
import { buildRegionalGeology } from "@/lib/geofisica/dipolo2d/build-regional-geology";
import {
  GARUVA_DEFAULT_LOCATION,
  inferRegionalGeology,
} from "@/lib/geofisica/dipolo2d/regional-geology";

const GEOLOGY_TIMEOUT_MS = 10_000;

async function buildRegionalWithTimeout(lat: number, lng: number) {
  return Promise.race([
    buildRegionalGeology(lat, lng),
    new Promise<ReturnType<typeof inferRegionalGeology>>((resolve) => {
      setTimeout(() => resolve(inferRegionalGeology(lat, lng)), GEOLOGY_TIMEOUT_MS);
    }),
  ]);
}

export const dynamic = "force-dynamic";

async function handleGeologyGet(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));

    const useLat = Number.isFinite(lat) ? lat : GARUVA_DEFAULT_LOCATION.lat;
    const useLng = Number.isFinite(lng) ? lng : GARUVA_DEFAULT_LOCATION.lng;

    const regional = await buildRegionalWithTimeout(useLat, useLng);

    return NextResponse.json({
      ok: true,
      lat: useLat,
      lng: useLng,
      regional: { ...regional, anchorLat: useLat, anchorLng: useLng },
      aiAvailable: isGeophysAiAvailable(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao consultar geologia";
    const useLat = Number.isFinite(Number(new URL(req.url).searchParams.get("lat")))
      ? Number(new URL(req.url).searchParams.get("lat"))
      : GARUVA_DEFAULT_LOCATION.lat;
    const useLng = Number.isFinite(Number(new URL(req.url).searchParams.get("lng")))
      ? Number(new URL(req.url).searchParams.get("lng"))
      : GARUVA_DEFAULT_LOCATION.lng;
    return NextResponse.json({
      ok: true,
      lat: useLat,
      lng: useLng,
      regional: inferRegionalGeology(useLat, useLng),
      aiAvailable: isGeophysAiAvailable(),
      error: msg,
    });
  }
}

export async function GET(req: Request) {
  return withGeophysicsApi(req, async (_ctx, r) => handleGeologyGet(r), {
    allowGlobalScope: true,
  });
}

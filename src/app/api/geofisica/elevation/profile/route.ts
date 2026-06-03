import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import { fetchDemElevations } from "@/lib/geofisica/geodata/fetch-elevation-dem";

export const dynamic = "force-dynamic";

async function handleElevationProfile(req: Request) {
  try {
    const body = (await req.json()) as {
      locations?: { lat: number; lng: number; stationM?: number }[];
    };

    const locations = body.locations?.filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lng) <= 180,
    );

    if (!locations?.length) {
      return NextResponse.json(
        { ok: false, error: "Forneça locations [{ lat, lng, stationM? }]." },
        { status: 400 },
      );
    }

    if (locations.length > 120) {
      return NextResponse.json(
        { ok: false, error: "Máximo 120 pontos por pedido." },
        { status: 400 },
      );
    }

    const result = await fetchDemElevations(locations);
    const valid = result.points.filter((p) => p.elevationM != null).length;

    if (valid < 2) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DEM não devolveu cotas suficientes. Verifique a posição da linha no mapa.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      points: result.points,
      dataset: result.dataset,
      source: result.source,
      validCount: valid,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao consultar DEM";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return withGeophysicsApi(req, async (_ctx, r) => handleElevationProfile(r), {
    allowGlobalScope: true,
  });
}

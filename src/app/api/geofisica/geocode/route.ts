import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import { searchBrazilCity } from "@/lib/geofisica/dipolo2d/city-geocode";

export const dynamic = "force-dynamic";

async function handleGeocodeGet(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe pelo menos 2 caracteres (ex.: Garuva)." },
      { status: 400 },
    );
  }

  try {
    const { results, sourcesTried } = await searchBrazilCity(q);

    if (!results.length) {
      return NextResponse.json({
        ok: false,
        error: `Nenhum resultado para «${q}». Tente «Garuva SC» ou «Joinville».`,
        results: [],
        sourcesTried,
      });
    }

    return NextResponse.json({
      ok: true,
      results: results.map(({ lat, lng, label, city, state }) => ({
        lat,
        lng,
        label,
        city,
        state,
      })),
      sourcesTried,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na geocodificação";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return withGeophysicsApi(req, async (_ctx, r) => handleGeocodeGet(r), {
    allowGlobalScope: true,
  });
}

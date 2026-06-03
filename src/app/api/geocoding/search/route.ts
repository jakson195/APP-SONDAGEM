import { NextResponse } from "next/server";

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
  city?: string;
  state?: string;
};

type NominatimItem = {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
  };
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe pelo menos 2 caracteres." },
      { status: 400 },
    );
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "DataGeo-Digital/1.0 (geofisica-ert; contact@datageo.local)",
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "Serviço de geocodificação indisponível." },
        { status: 502 },
      );
    }

    const raw = (await res.json()) as NominatimItem[];
    const results = raw
      .map((item): GeocodeResult | null => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const addr = item.address;
        const city =
          addr?.city ??
          addr?.town ??
          addr?.village ??
          addr?.municipality;
        return {
          lat,
          lng,
          displayName: item.display_name,
          city,
          state: addr?.state,
        };
      })
      .filter((r): r is GeocodeResult => r != null);

    return NextResponse.json({ ok: true, query: q, results });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Falha ao consultar o mapa." },
      { status: 500 },
    );
  }
}

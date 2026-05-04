import { NextResponse } from "next/server";

export const dynamic = "force-static";

/**
 * Gera imagem PNG do mapa (Google Static Maps) para o ponto WGS84.
 * Ative "Maps Static API" na mesma chave do projeto Google Cloud.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const zoomRaw = searchParams.get("zoom");

  const lat = latRaw === null || latRaw === "" ? NaN : Number(latRaw);
  const lng = lngRaw === null || lngRaw === "" ? NaN : Number(lngRaw);
  const zoom =
    zoomRaw === null || zoomRaw === "" ? 16 : Math.round(Number(zoomRaw));

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return NextResponse.json({ error: "lat inválida" }, { status: 400 });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "lng inválida" }, { status: 400 });
  }
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 21) {
    return NextResponse.json({ error: "zoom entre 1 e 21" }, { status: 400 });
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    "";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Defina GOOGLE_MAPS_API_KEY ou NEXT_PUBLIC_GOOGLE_MAPS_API_KEY e ative Maps Static API",
      },
      { status: 503 },
    );
  }

  const w = 640;
  const h = 360;
  const center = `${lat},${lng}`;
  const marker = `color:0x0d9488|size:mid|${lat},${lng}`;

  const gUrl =
    "https://maps.googleapis.com/maps/api/staticmap?" +
    new URLSearchParams({
      center,
      zoom: String(zoom),
      size: `${w}x${h}`,
      scale: "2",
      maptype: "roadmap",
      markers: marker,
      key: apiKey,
    }).toString();

  try {
    const upstream = await fetch(gUrl, { next: { revalidate: 3600 } });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Falha ao gerar mapa estático",
          detail: text.slice(0, 200),
        },
        { status: 502 },
      );
    }

    const buf = await upstream.arrayBuffer();
    const ct = upstream.headers.get("content-type") ?? "image/png";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Erro de rede ao contactar Google Static Maps" },
      { status: 502 },
    );
  }
}

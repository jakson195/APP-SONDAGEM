import { NextResponse } from "next/server";
import sharp from "sharp";

import { buildMapPngFromTiles } from "@/lib/map-location-tiles";

export const dynamic = "force-dynamic";

function buildPlaceholderSvg(lat: number, lng: number, zoom: number): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const coord = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#f1f5f9"/>
  <g stroke="#cbd5e1" stroke-width="1">
    ${Array.from({ length: 9 }, (_, i) => {
      const x = (i * 640) / 8;
      return `<line x1="${x}" y1="0" x2="${x}" y2="360"/>`;
    }).join("")}
    ${Array.from({ length: 6 }, (_, i) => {
      const y = (i * 360) / 5;
      return `<line x1="0" y1="${y}" x2="640" y2="${y}"/>`;
    }).join("")}
  </g>
  <text x="320" y="28" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#0f172a">Mapa de localização (WGS84)</text>
  <text x="320" y="50" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#475569">${esc(coord)} · zoom ${zoom}</text>
  <text x="320" y="72" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#64748b">Vista esquemática — sem rede para tiles de mapa; opcional: chave Google Static Maps</text>
  <circle cx="320" cy="200" r="10" fill="#0d9488" stroke="#ffffff" stroke-width="3"/>
  <circle cx="320" cy="200" r="3" fill="#ffffff"/>
</svg>`;
}

async function fetchGoogleStatic(
  lat: number,
  lng: number,
  zoom: number,
  apiKey: string,
): Promise<ArrayBuffer | null> {
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
      maptype: "satellite",
      markers: marker,
      key: apiKey,
    }).toString();
  try {
    const upstream = await fetch(gUrl, { next: { revalidate: 3600 } });
    if (!upstream.ok) return null;
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength < 500) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Fallback sem chave Google: serviço de mapa estático da comunidade OSM. */
async function fetchOsmStaticMap(
  lat: number,
  lng: number,
  zoom: number,
): Promise<ArrayBuffer | null> {
  const z = Math.min(18, Math.max(1, zoom));
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(z),
    size: "640x360",
    maptype: "mapnik",
    markers: `${lat},${lng},red-pushpin`,
  });
  const url = `https://staticmap.openstreetmap.de/staticmap.php?${params}`;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "APP-SONDAGEM/1.0 (geotechnical reports; static map fallback)",
        Accept: "image/png,image/*,*/*",
      },
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 500) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Gera imagem para o ponto WGS84 no relatório PDF.
 * 1) Google Static Maps (se existir chave e a API responder)
 * 2) OpenStreetMap (staticmap.openstreetmap.de)
 * 3) Tiles (Esri imagem + OSM ruas) compostos com sharp
 * 4) SVG esquemático (sempre disponível)
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

  if (apiKey) {
    const googleBuf = await fetchGoogleStatic(lat, lng, zoom, apiKey);
    if (googleBuf) {
      return new NextResponse(googleBuf, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          "X-Map-Source": "google-static",
        },
      });
    }
  }

  const osmBuf = await fetchOsmStaticMap(lat, lng, zoom);
  if (osmBuf) {
    return new NextResponse(osmBuf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Map-Source": "osm-static",
      },
    });
  }

  const tileBuf = await buildMapPngFromTiles(lat, lng, zoom, true);
  if (tileBuf && tileBuf.length > 500) {
    const body = Uint8Array.from(tileBuf);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Map-Source": "tiles-esri-osm",
      },
    });
  }

  const svg = buildPlaceholderSvg(lat, lng, zoom);
  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new NextResponse(Uint8Array.from(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Map-Source": "placeholder",
      },
    });
  } catch {
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Map-Source": "placeholder",
      },
    });
  }
}

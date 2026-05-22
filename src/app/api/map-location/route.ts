import { NextResponse } from "next/server";
import sharp from "sharp";

import type { MapLocationCaption } from "@/lib/map-location-caption";
import {
  appendMapCaptionPng,
  buildMapPngFromTiles,
} from "@/lib/map-location-tiles";

export const dynamic = "force-dynamic";

function buildPlaceholderSvg(
  lat: number,
  lng: number,
  zoom: number,
  caption?: MapLocationCaption,
): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const coord = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const titulo = esc(caption?.titulo ?? "Furo");
  const desc = caption?.descricao?.trim()
    ? `<text x="320" y="98" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#475569">${esc(caption.descricao.slice(0, 72))}</text>`
    : "";
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
  <text x="320" y="52" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="600" fill="#0f172a">${titulo}</text>
  ${desc}
  <text x="320" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#475569">${esc(coord)} · zoom ${zoom}</text>
  <text x="320" y="140" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#64748b">Sem ligação aos tiles de satélite — verifique rede do servidor</text>
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
    const upstream = await fetch(gUrl, { cache: "no-store" });
    if (!upstream.ok) return null;
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength < 500) return null;
    return buf;
  } catch {
    return null;
  }
}

function pngResponse(
  body: Uint8Array | ArrayBuffer,
  source: string,
): NextResponse {
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Map-Source": source,
    },
  });
}

/**
 * Gera imagem para o ponto WGS84 no relatório PDF.
 * 1) Tiles Esri (satélite, estilo Google Earth)
 * 2) Google Static Maps (se existir chave)
 * 3) Tiles de rua (Carto/OSM)
 * 4) SVG esquemático (último recurso)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const zoomRaw = searchParams.get("zoom");
  const label = searchParams.get("label")?.trim() ?? "";
  const desc = searchParams.get("desc")?.trim() ?? "";

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

  const caption: MapLocationCaption | undefined =
    label || desc
      ? { titulo: label || "Furo", descricao: desc || undefined, lat, lng }
      : { titulo: "Furo", lat, lng };

  /** Carto/OSM costumam responder melhor no servidor; depois satélite Esri. */
  let tileBuf = await buildMapPngFromTiles(lat, lng, zoom, false, caption);
  if (tileBuf && tileBuf.length > 500) {
    return pngResponse(tileBuf, "tiles-street");
  }

  tileBuf = await buildMapPngFromTiles(lat, lng, zoom, true, caption);
  if (tileBuf && tileBuf.length > 500) {
    return pngResponse(tileBuf, "tiles-imagery");
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    "";

  if (apiKey) {
    const googleBuf = await fetchGoogleStatic(lat, lng, zoom, apiKey);
    if (googleBuf) {
      let png: Buffer = Buffer.from(googleBuf);
      if (caption) {
        png = await appendMapCaptionPng(png, caption);
      }
      return pngResponse(new Uint8Array(png), "google-static");
    }
  }

  const svg = buildPlaceholderSvg(lat, lng, zoom, caption);
  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return pngResponse(png, "placeholder");
  } catch {
    /** Sempre PNG para o <img> do relatório (evita SVG que falha em alguns browsers). */
    const pngMin = await sharp({
      create: {
        width: 640,
        height: 360,
        channels: 3,
        background: { r: 241, g: 245, b: 249 },
      },
    })
      .png()
      .toBuffer();
    return pngResponse(pngMin, "placeholder-minimal");
  }
}

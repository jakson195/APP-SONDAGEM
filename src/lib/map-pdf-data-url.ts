/**
 * Gera data URL PNG para o mapa no relatório PDF (html2canvas exige data URL, não blob:).
 */

import type { MapLocationCaption } from "@/lib/map-location-caption";
import {
  drawMapLocationTilesOnCanvas,
  drawPlaceholderMapDataUrl,
} from "@/lib/map-location-tiles-browser";
import { apiUrl } from "@/lib/api-url";

const OUT_W = 640;
const OUT_H = 360;

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const v = r.result;
      resolve(typeof v === "string" && v.startsWith("data:image/") ? v : null);
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

async function fetchMapBlobFromApi(
  lat: number,
  lng: number,
  zoom: number,
  caption: MapLocationCaption,
): Promise<Blob | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    zoom: String(zoom),
    label: caption.titulo,
  });
  if (caption.descricao) params.set("desc", caption.descricao);

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(apiUrl(`/api/map-location?${params}`), {
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("json")) return null;
    const blob = await res.blob();
    if (blob.size < 200) return null;
    return blob;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function tilesToDataUrl(
  lat: number,
  lng: number,
  zoom: number,
  caption: MapLocationCaption,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  for (const preferImagery of [false, true]) {
    const ok = await drawMapLocationTilesOnCanvas(
      canvas,
      lat,
      lng,
      zoom,
      preferImagery,
      caption,
    );
    if (ok) {
      try {
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Obtém PNG em data URL para o PDF: tiles no browser → API → esquema com coordenadas.
 * O último passo garante que o relatório mostra sempre alguma imagem se há lat/lng.
 */
export async function loadMapPdfDataUrl(
  lat: number,
  lng: number,
  zoom: number,
  caption: MapLocationCaption,
): Promise<string> {
  const fromTiles = await tilesToDataUrl(lat, lng, zoom, caption);
  if (fromTiles) return fromTiles;

  const blob = await fetchMapBlobFromApi(lat, lng, zoom, caption);
  if (blob) {
    const fromApi = await blobToDataUrl(blob);
    if (fromApi) return fromApi;
  }

  return drawPlaceholderMapDataUrl(lat, lng, zoom, caption);
}

export const MAP_PDF_WIDTH = OUT_W;
export const MAP_PDF_HEIGHT = OUT_H;

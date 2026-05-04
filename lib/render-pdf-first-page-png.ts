/**
 * Rasteriza a 1.ª página do PDF para PNG (data URL). Apenas no browser.
 * Usa o worker do pdf.js via CDN (mesma versão do pacote).
 * Opcionalmente deteta limites WGS84 em GeoPDF (GPTS / OGC em texto ou metadados).
 */
import type { Wgs84Bounds } from "./parse-pdf-georef";
import {
  maybeTransposeMisreadGptsBounds,
  tryExtractPdfWgs84Bounds,
} from "./parse-pdf-georef";

export type { Wgs84Bounds } from "./parse-pdf-georef";

export type RenderPdfFirstPageWithGeoResult = {
  dataUrl: string;
  width: number;
  height: number;
  /** Limites lidos do PDF (GeoPDF); `null` se não encontrados. */
  pdfGeoBounds: Wgs84Bounds | null;
};

export async function renderPdfFirstPageToPngWithGeo(
  data: ArrayBuffer,
  maxEdgePx = 4096,
): Promise<RenderPdfFirstPageWithGeoResult> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;
  }

  /** Cópia só para o worker — o pdf.js pode desligar (detach) este ArrayBuffer. */
  const workerBytes = new Uint8Array(data.slice(0));
  const loadingTask = pdfjs.getDocument({ data: workerBytes });
  const pdf = await loadingTask.promise;

  /** Cópia separada para GPTS/XML em texto; não partilhar buffer com `getDocument`. */
  const preScanBytes = new Uint8Array(data.slice(0));

  try {
    const pdfGeoBounds = await tryExtractPdfWgs84Bounds(preScanBytes, pdf);

    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    let scale = 2;
    const w = base.width * scale;
    const h = base.height * scale;
    const m = Math.max(w, h);
    if (m > maxEdgePx) {
      scale = maxEdgePx / Math.max(base.width, base.height);
    }
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D indisponível neste browser.");
    }
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    canvas.width = width;
    canvas.height = height;
    const task = page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    });
    await task.promise;
    const dataUrl = canvas.toDataURL("image/png");
    let refinedBounds = pdfGeoBounds;
    if (refinedBounds) {
      refinedBounds = maybeTransposeMisreadGptsBounds(refinedBounds);
    }
    return { dataUrl, width, height, pdfGeoBounds: refinedBounds };
  } finally {
    await pdf.destroy();
  }
}

/** Só a imagem PNG (compatibilidade). */
export async function renderPdfFirstPageToPngDataUrl(
  data: ArrayBuffer,
  maxEdgePx = 4096,
): Promise<string> {
  const r = await renderPdfFirstPageToPngWithGeo(data, maxEdgePx);
  return r.dataUrl;
}

export function parseGeoDecimal(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

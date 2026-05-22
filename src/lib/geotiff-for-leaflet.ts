import { fromBlob } from "geotiff";

import {
  crsLabel,
  resolveGeotiffWgs84Bounds,
  type GeotiffCrsInfo,
} from "@/lib/geotiff-crs";

const MAX_EDGE_PX = 4096;

export type GeotiffLeafletImport = {
  dataUrl: string;
  bounds: { south: number; west: number; north: number; east: number };
  imgSize: { w: number; h: number };
  crs: GeotiffCrsInfo;
};

/**
 * Lê um GeoTIFF no browser, identifica CRS/geokeys, converte limites para WGS84
 * (UTM/SIRGAS/etc. via proj4) e gera PNG para `L.imageOverlay`.
 */
export async function geotiffToPngDataUrlAndBounds(
  file: File,
): Promise<GeotiffLeafletImport> {
  const tiff = await fromBlob(file);
  try {
    const image = await tiff.getImage();
    const { bounds, crs } = await resolveGeotiffWgs84Bounds(image);

    const iw = image.getWidth();
    const ih = image.getHeight();
    let outW = iw;
    let outH = ih;
    const m = Math.max(iw, ih);
    if (m > MAX_EDGE_PX) {
      const s = MAX_EDGE_PX / m;
      outW = Math.max(1, Math.floor(iw * s));
      outH = Math.max(1, Math.floor(ih * s));
    }

    const raw = await image.readRGB({
      width: outW,
      height: outH,
      resampleMethod: "bilinear",
      interleave: true,
    });

    const w = raw.width;
    const h = raw.height;
    const src = raw as unknown as
      | Uint8Array
      | Uint16Array
      | Int16Array
      | Int32Array
      | Float32Array;
    const bpe = src.BYTES_PER_ELEMENT;
    const scale = (v: number) =>
      bpe === 1
        ? Math.min(255, Math.max(0, Math.round(v)))
        : Math.min(255, Math.max(0, Math.round((v / 65535) * 255)));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D indisponível neste browser.");
    }
    const imgData = ctx.createImageData(w, h);
    const pix = imgData.data;
    for (let i = 0, j = 0; i + 2 < src.length && j < pix.length; i += 3, j += 4) {
      pix[j] = scale(Number(src[i]));
      pix[j + 1] = scale(Number(src[i + 1]));
      pix[j + 2] = scale(Number(src[i + 2]));
      pix[j + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");

    return {
      dataUrl,
      bounds,
      imgSize: { w, h },
      crs,
    };
  } finally {
    await tiff.close();
  }
}

/** Mensagem curta após importação bem-sucedida. */
export function geotiffImportSuccessMessage(fileName: string, crs: GeotiffCrsInfo): string {
  const geo = crs.reprojected
    ? `Georreferência: ${crs.label} → WGS84`
    : `Georreferência: ${crs.label}`;
  return `GeoTIFF «${fileName}» carregado. ${geo}.`;
}

export { crsLabel };

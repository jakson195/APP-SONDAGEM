import { fromBlob } from "geotiff";

const MAX_EDGE_PX = 4096;

function bboxLooksLikeWgs84Degrees(bb: number[]): boolean {
  const [minX, minY, maxX, maxY] = bb;
  if (![minX, minY, maxX, maxY].every((n) => Number.isFinite(n))) return false;
  if (Math.abs(minX) > 180 || Math.abs(maxX) > 180) return false;
  if (Math.abs(minY) > 90 || Math.abs(maxY) > 90) return false;
  return true;
}

/**
 * Lê um GeoTIFF no browser, gera PNG (data URL) para `L.imageOverlay` e limites em graus.
 * Só CRS em graus (ex.: EPSG:4326 do QGIS); rasters projetados (UTM, etc.) não são
 * reprojetados aqui — exporte em WGS 84.
 */
export async function geotiffToPngDataUrlAndBounds(file: File): Promise<{
  dataUrl: string;
  bounds: { south: number; west: number; north: number; east: number };
  imgSize: { w: number; h: number };
}> {
  const tiff = await fromBlob(file);
  try {
    const image = await tiff.getImage();
    let bbox: number[];
    try {
      bbox = image.getBoundingBox();
    } catch {
      throw new Error(
        "Este TIFF não tem georreferenciação (transformação) legível. No QGIS exporte como GeoTIFF com CRS e extensão corretos.",
      );
    }

    const geoKeys = image.getGeoKeys();
    const pcs = geoKeys?.ProjectedCSTypeGeoKey;
    if (pcs != null && pcs !== 32767 && !bboxLooksLikeWgs84Degrees(bbox)) {
      throw new Error(
        "Este GeoTIFF está num CRS projetado (ex.: UTM). Para ir direto ao sítio certo, exporte em WGS 84: camada → Exportar → Guardar como raster → CRS EPSG:4326. Alternativa: use PDF e marque os cantos no mapa.",
      );
    }

    if (!bboxLooksLikeWgs84Degrees(bbox)) {
      throw new Error(
        "Os limites do TIFF não parecem ser graus WGS84. Exporte o raster em EPSG:4326 ou use PDF com marcação de cantos.",
      );
    }

    const [minX, minY, maxX, maxY] = bbox;
    const west = Math.min(minX, maxX);
    const east = Math.max(minX, maxX);
    const south = Math.min(minY, maxY);
    const north = Math.max(minY, maxY);

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
      bounds: { south, west, north, east },
      imgSize: { w, h },
    };
  } finally {
    await tiff.close();
  }
}

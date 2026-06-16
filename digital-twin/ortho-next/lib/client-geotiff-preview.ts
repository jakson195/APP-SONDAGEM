import { fromBlob } from "geotiff";

export type ClientRasterPreview = {
  previewUrl: string;
  bounds: [number, number, number, number];
};

/** Gera preview PNG + bbox no browser a partir de um GeoTIFF. */
export async function buildClientGeotiffPreview(file: File): Promise<ClientRasterPreview> {
  const tiff = await fromBlob(file);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const samples = [0, 1, 2].filter((s) => s < image.getSamplesPerPixel());
  const raster = await image.readRasters({
    window: [0, 0, width, height],
    width: outW,
    height: outH,
    samples: samples.length > 0 ? samples : [0],
    interleave: true,
  });

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");

  const imageData = ctx.createImageData(outW, outH);
  const pixels = raster as ArrayLike<number>;
  const spp = Math.max(1, samples.length);

  for (let i = 0, j = 0; i < outW * outH; i++, j += 4) {
    const base = i * spp;
    const r = toByte(pixels[base] ?? 0);
    const g = toByte(spp >= 2 ? pixels[base + 1] : r);
    const b = toByte(spp >= 3 ? pixels[base + 2] : r);
    imageData.data[j] = r;
    imageData.data[j + 1] = g;
    imageData.data[j + 2] = b;
    imageData.data[j + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  const [minX, minY, maxX, maxY] = image.getBoundingBox();

  return {
    previewUrl: canvas.toDataURL("image/png"),
    bounds: [minX, minY, maxX, maxY],
  };
}

function toByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return Math.round(value * 255);
  return Math.min(255, Math.round(value));
}

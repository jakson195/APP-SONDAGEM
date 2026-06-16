import { fromArrayBuffer } from "geotiff";

import {
  applyDeformationColormap,
  type DeformationThresholds,
  DEFAULT_DEFORMATION_THRESHOLDS,
} from "./colormap";

export interface GeotiffOverlayData {
  canvas: HTMLCanvasElement;
  blobUrl: string;
  rectangle: [number, number, number, number];
  width: number;
  height: number;
  values: Float32Array;
  minValue: number;
  maxValue: number;
  nodata: number | null;
  epochDate: string | null;
}

export async function loadGeotiffOverlay(
  buffer: ArrayBuffer,
  thresholds: DeformationThresholds = DEFAULT_DEFORMATION_THRESHOLDS,
  epochDate: string | null = null,
): Promise<GeotiffOverlayData> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox();
  const raster = await image.readRasters({ interleave: false });
  const band = raster[0] as Float32Array | Float64Array | number[];

  const nodata = image.getGDALNoData() ?? -9999;
  const values =
    band instanceof Float32Array
      ? band
      : band instanceof Float64Array
        ? Float32Array.from(band)
        : Float32Array.from(band as number[]);

  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v) || v === nodata) continue;
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  if (!Number.isFinite(minV)) {
    minV = 0;
    maxV = 0;
  }

  const imageData = applyDeformationColormap(
    values,
    width,
    height,
    thresholds,
    nodata,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png");
  });
  const blobUrl = URL.createObjectURL(blob);

  const rectangle: [number, number, number, number] = [
    bbox[0],
    bbox[1],
    bbox[2],
    bbox[3],
  ];

  return {
    canvas,
    blobUrl,
    rectangle,
    width,
    height,
    values,
    minValue: minV,
    maxValue: maxV,
    nodata,
    epochDate,
  };
}

export async function fetchGeotiffBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GeoTIFF (${res.status}): ${url}`);
  }
  return res.arrayBuffer();
}

/** Reaplica colormap com novos limiares (sem re-fetch). */
export async function recolorGeotiffCanvas(
  values: ArrayLike<number>,
  width: number,
  height: number,
  thresholds: DeformationThresholds,
  nodata: number | null,
): Promise<{ canvas: HTMLCanvasElement; blobUrl: string }> {
  const imageData = applyDeformationColormap(
    values,
    width,
    height,
    thresholds,
    nodata,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png");
  });
  return { canvas, blobUrl: URL.createObjectURL(blob) };
}

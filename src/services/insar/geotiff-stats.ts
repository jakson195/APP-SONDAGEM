import { readFile } from "fs/promises";
import { fromArrayBuffer, type GeoTIFFImage } from "geotiff";
import type { Polygon } from "geojson";

export type GeoTiffFileStats = {
  width: number;
  height: number;
  crsEpsg: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  minValue: number;
  maxValue: number;
  meanValue: number;
  nodata: number | null;
  footprint: Polygon;
};

function boundsToFootprint(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}

/** EPSG quando disponível nos geokeys; caso contrário assume WGS84 geográfico. */
function epsgFromImage(image: GeoTIFFImage): number {
  try {
    const keys = image.getGeoKeys();
    if (!keys) return 4326;
    const projected = (keys as Record<string, unknown>).ProjectedCSTypeGeoKey;
    const geographic = (keys as Record<string, unknown>).GeographicTypeGeoKey;
    const raw =
      typeof projected === "number"
        ? projected
        : typeof geographic === "number"
          ? geographic
          : null;
    if (raw == null || raw === 32767) return 4326;
    return raw > 0 ? raw : 4326;
  } catch {
    return 4326;
  }
}

function readNodata(image: GeoTIFFImage): number | null {
  try {
    const fd = image.fileDirectory as unknown as { GDAL_NODATA?: string };
    const raw = fd.GDAL_NODATA;
    if (raw === undefined || raw === "") return null;
    const n = Number.parseFloat(String(raw));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Estatísticas de uma banda float (GeoTIFF produzido pelo SNAP ou fallback). */
export async function readGeoTiffStatsFromPath(absPath: string): Promise<GeoTiffFileStats> {
  const buf = await readFile(absPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tiff = await fromArrayBuffer(ab);
  const image = await tiff.getImage();
  const w = image.getWidth();
  const h = image.getHeight();
  const bbox = image.getBoundingBox();
  const nodata = readNodata(image);
  const crsEpsg = epsgFromImage(image);

  const data = await image.readRasters({ samples: [0] });
  const band = data[0] as Float32Array | Int16Array | Uint16Array;
  let sum = 0;
  let count = 0;
  let vmin = Number.POSITIVE_INFINITY;
  let vmax = Number.NEGATIVE_INFINITY;
  const nd = nodata ?? Number.NaN;
  for (let i = 0; i < band.length; i++) {
    const v = band[i];
    if (!Number.isFinite(v)) continue;
    if (Number.isFinite(nd) && v === nd) continue;
    vmin = Math.min(vmin, Number(v));
    vmax = Math.max(vmax, Number(v));
    sum += Number(v);
    count++;
  }
  if (count === 0) {
    vmin = 0;
    vmax = 0;
  }

  return {
    width: w,
    height: h,
    crsEpsg,
    bounds: {
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
    },
    minValue: vmin,
    maxValue: vmax,
    meanValue: count ? sum / count : 0,
    nodata,
    footprint: boundsToFootprint(bbox[0], bbox[1], bbox[2], bbox[3]),
  };
}

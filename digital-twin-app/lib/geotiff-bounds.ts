import { fromArrayBuffer } from "geotiff";
import { readFile } from "fs/promises";

/** Bbox WGS84: [west, south, east, north] */
export async function readGeotiffBounds(filePath: string): Promise<[number, number, number, number]> {
  const buffer = await readFile(filePath);
  const tiff = await fromArrayBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const image = await tiff.getImage();
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  return [minX, minY, maxX, maxY];
}

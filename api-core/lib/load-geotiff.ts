import {
  fromBlob,
  type GeoTIFF,
  type GeoTIFFImage,
  type TypedArrayArrayWithDimensions,
} from "geotiff";

export type LoadedGeoTiff = {
  tiff: GeoTIFF;
  image: GeoTIFFImage;
  /** Resultado de `image.readRasters()` (bandas; `width` / `height` nos metadados do array). */
  rasters: TypedArrayArrayWithDimensions;
};

/**
 * Lê um GeoTIFF a partir de um `File` ou `Blob` (browser).
 *
 * Equivale ao fluxo: `fromBlob` → `getImage()` → `readRasters()`.
 * A API pública usa `fromBlob`; não existe `GeoTIFF.fromBlob` estático nesta versão do pacote.
 */
export async function loadGeoTiff(
  file: Blob | File,
  signal?: AbortSignal,
): Promise<LoadedGeoTiff> {
  const tiff = await fromBlob(file, signal);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  return { tiff, image, rasters };
}

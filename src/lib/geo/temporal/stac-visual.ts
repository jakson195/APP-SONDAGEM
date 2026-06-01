/** Ano a partir do qual exibimos cor natural (estilo Google Earth). */
export const LANDSAT_NATURAL_COLOR_FROM_YEAR = 1999;

/** Fórmula TiTiler — cor natural tipo Google Earth / Earth Engine. */
export const NATURAL_COLOR_FORMULA =
  "Gamma RGB 1.85 Saturation 1.2 Sigmoidal RGB 14 0.32";

export const GRAYSCALE_FORMULA = "Grayscale";

export type StacVisualMode = "natural" | "grayscale";

export function visualModeForDate(date: string): StacVisualMode {
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year)) return "natural";
  return year < LANDSAT_NATURAL_COLOR_FROM_YEAR ? "grayscale" : "natural";
}

export function isPhotoSpectralIndex(
  index: string,
): index is "rgb" | "grayscale" | "false_color" {
  return index === "rgb" || index === "grayscale" || index === "false_color";
}

/** URL de tiles STAC via TiTiler com renderização fotográfica. */
export function stacTitilerPhotoTileUrl(
  itemSelfHref: string,
  date: string,
  forceMode?: StacVisualMode,
): string {
  const mode =
    forceMode ??
    (visualModeForDate(date) === "grayscale" ? "grayscale" : "natural");
  const u = encodeURIComponent(itemSelfHref);
  const formula = encodeURIComponent(
    mode === "grayscale" ? GRAYSCALE_FORMULA : NATURAL_COLOR_FORMULA,
  );
  return (
    `https://titiler.xyz/stac/tiles/WebMercatorQuad/{z}/{x}/{y}` +
    `?url=${u}&assets=red,green,blue&rescale=0,10000&color_formula=${formula}&format=png`
  );
}

/** Esri World Imagery — referência visual actual (Google Earth). */
export const ESRI_WORLD_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

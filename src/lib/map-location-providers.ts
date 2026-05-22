/**
 * Fontes de tiles para mapa estático (PDF / API).
 * Carto e OSM expõem CORS — adequados ao canvas no browser.
 * Esri satélite — funciona no servidor e no Leaflet (<img>).
 */

export type MapTileProviderId =
  | "carto-voyager"
  | "carto-light"
  | "osm"
  | "esri-imagery"
  | "opentopo";

export type MapTileProvider = {
  id: MapTileProviderId;
  /** Satélite / foto aérea. */
  imagery: boolean;
  /** Costuma permitir drawImage em canvas (fetch + CORS). */
  corsFriendly: boolean;
  url: (z: number, x: number, y: number) => string;
};

const CARTO_SUB = ["a", "b", "c", "d"] as const;

export const MAP_TILE_PROVIDERS: MapTileProvider[] = [
  {
    id: "carto-voyager",
    imagery: false,
    corsFriendly: true,
    url: (z, x, y) => {
      const s = CARTO_SUB[(x + y) % CARTO_SUB.length];
      return `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
    },
  },
  {
    id: "carto-light",
    imagery: false,
    corsFriendly: true,
    url: (z, x, y) => {
      const s = CARTO_SUB[(x + y) % CARTO_SUB.length];
      return `https://${s}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
    },
  },
  {
    id: "osm",
    imagery: false,
    corsFriendly: false,
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  {
    id: "esri-imagery",
    imagery: true,
    corsFriendly: false,
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  {
    id: "opentopo",
    imagery: false,
    corsFriendly: true,
    url: (z, x, y) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
  },
];

/** Ordem para montagem no servidor (satélite primeiro). */
export function mapTileProvidersForServer(
  preferImagery: boolean,
): MapTileProvider[] {
  const imagery = MAP_TILE_PROVIDERS.filter((p) => p.imagery);
  const street = MAP_TILE_PROVIDERS.filter((p) => !p.imagery);
  if (preferImagery) {
    return [...imagery, ...street];
  }
  return [...street, ...imagery];
}

/** Ordem para canvas no browser (CORS primeiro). */
export function mapTileProvidersForBrowser(
  preferImagery: boolean,
): MapTileProvider[] {
  const corsOk = MAP_TILE_PROVIDERS.filter((p) => p.corsFriendly);
  const rest = MAP_TILE_PROVIDERS.filter((p) => !p.corsFriendly);
  if (preferImagery) {
    const esri = rest.filter((p) => p.id === "esri-imagery");
    const other = rest.filter((p) => p.id !== "esri-imagery");
    return [...esri, ...corsOk, ...other];
  }
  return [...corsOk, ...rest];
}

export const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_REFERENCE_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

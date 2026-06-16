/** Camadas raster GeoSGB/CPRM — aerogeofísica (magnetometria). */

export type GeophysicsRasterDef = {
  /** ID no catálogo / layerStore (API layers.py). */
  catalogId: string;
  sourceId: string;
  layerId: string;
  label: string;
  tiles: string[];
  /** Zoom mínimo para pedir tiles ao GeoSGB (ArcGIS LOD). */
  tileMinZoom: number;
  /** Zoom máximo de tiles disponíveis no serviço CPRM. */
  tileMaxZoom: number;
  /** Zoom mínimo de visibilidade no mapa. */
  layerMinZoom: number;
  /** Zoom máximo de visibilidade — acima de tileMaxZoom usa overzoom. */
  layerMaxZoom: number;
  attribution: string;
};

const MAG_SERVER =
  "https://geoportal.sgb.gov.br/server/rest/services/Mapas_Tern_Mag_MIL1/MapServer";

function arcgisExportTiles(showLayer: number): string {
  return `${MAG_SERVER}/export?bbox={bbox-epsg-3857}&size=256,256&format=png&transparent=true&f=image&layers=show:${showLayer}`;
}

/** Mapas ternários e anomalia magnética — cobertura ~51% do território (CPRM/SGB). */
export const GEOPHYSICS_RASTER_LAYERS: GeophysicsRasterDef[] = [
  {
    catalogId: "magnetometry_ternary",
    sourceId: "hidrogeo-mag-ternary-src",
    layerId: "hidrogeo-mag-ternary-raster",
    label: "Magnetometria — mapa ternário (CPRM)",
    tiles: [arcgisExportTiles(0)],
    tileMinZoom: 3,
    tileMaxZoom: 9,
    layerMinZoom: 3,
    layerMaxZoom: 22,
    attribution: "© CPRM/SGB — Aerogeofísica",
  },
  {
    catalogId: "magnetometry_anomaly",
    sourceId: "hidrogeo-mag-anomaly-src",
    layerId: "hidrogeo-mag-anomaly-raster",
    label: "Magnetometria — anomalia magnética (CPRM)",
    tiles: [arcgisExportTiles(1)],
    tileMinZoom: 3,
    tileMaxZoom: 9,
    layerMinZoom: 3,
    layerMaxZoom: 22,
    attribution: "© CPRM/SGB — Aerogeofísica",
  },
];

export const GEOPHYSICS_RASTER_IDS = GEOPHYSICS_RASTER_LAYERS.map((l) => l.catalogId);

export function geophysicsRasterByCatalogId(id: string): GeophysicsRasterDef | undefined {
  return GEOPHYSICS_RASTER_LAYERS.find((l) => l.catalogId === id);
}

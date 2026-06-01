import type { GeodataCatalogEntry } from "./types";

/**
 * Catálogo complementar USGS — DEM, sensoriamento, lineamentos.
 * EarthExplorer: https://earthexplorer.usgs.gov/
 *
 * Nota: a maioria exige autenticação/token para download em massa.
 * Aqui ficam endpoints públicos úteis para overlay e contexto regional.
 */
export const USGS_CATALOG: GeodataCatalogEntry[] = [
  {
    id: "usgs-3dep-elevation",
    provider: "usgs",
    label: "USGS 3DEP — Elevação (ImageServer)",
    category: "dem",
    priority: 100,
    type: "arcgis_imageserver",
    url: "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
    https: true,
    role: "context",
    docsUrl: "https://www.usgs.gov/3d-elevation-program",
    notes: "SRTM/NED — relevo, lineamentos, drenagem",
  },
  {
    id: "usgs-hydro-shaded",
    provider: "usgs",
    label: "USGS — Hidrografia / relevo sombreado",
    category: "geomorfologia",
    priority: 110,
    type: "arcgis_mapserver",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer",
    https: true,
    role: "context",
    docsUrl: "https://apps.nationalmap.gov/services/",
  },
  {
    id: "usgs-landsat-wms",
    provider: "usgs",
    label: "USGS — Landsat (referência WMS nacional)",
    category: "sensoriamento",
    priority: 120,
    type: "wms",
    url: "https://imagery.nationalmap.gov/arcgis/services/USGSNAIPImagery/ImageServer/WMSServer",
    wmsLayers: "0",
    https: true,
    role: "context",
    docsUrl: "https://earthexplorer.usgs.gov/",
    notes: "NAIP/imagery — para Landsat usar EarthExplorer ou M2M API",
  },
];

export const USGS_EARTHEXPLORER = {
  portal: "https://earthexplorer.usgs.gov/",
  datasets: [
    { id: "SRTM", label: "SRTM DEM", use: "relevo, falhas, drenagem" },
    { id: "LANDSAT", label: "Landsat", use: "lineamentos, alteração" },
    { id: "ASTER", label: "ASTER GDEM", use: "DEM regional" },
  ],
} as const;

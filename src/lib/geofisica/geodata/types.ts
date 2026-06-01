/** Categorias de dados — alinhado ao GeoSGB / downloads SGB. */
export type GeodataCategory =
  | "geologia"
  | "litologia"
  | "estruturas"
  | "falhas"
  | "magnetometria"
  | "gamaespectrometria"
  | "geofisica_aerea"
  | "minerais"
  | "geomorfologia"
  | "dem"
  | "sensoriamento";

export type GeodataProvider = "geosgb" | "cprm_legacy" | "usgs" | "macrostrat";

export type GeodataServiceType =
  | "arcgis_mapserver"
  | "arcgis_featureserver"
  | "wms"
  | "wmts"
  | "arcgis_imageserver";

/** Entrada do catálogo — serviço consultável (REST identify / WMS). */
export type GeodataCatalogEntry = {
  id: string;
  provider: GeodataProvider;
  label: string;
  category: GeodataCategory;
  /** Menor = maior prioridade na consulta pontual. */
  priority: number;
  type: GeodataServiceType;
  /** URL base MapServer/FeatureServer ou endpoint WMS. */
  url: string;
  /** Índice(s) de camada WMS (ex. "0" ou "0,1"). */
  wmsLayers?: string;
  /** Acesso HTTPS (seguro no browser). */
  https: boolean;
  /** Uso principal na interpretação ERT. */
  role: "truth" | "context" | "geophysics" | "structure";
  docsUrl?: string;
  notes?: string;
};

export type GeodataPointHit = {
  name: string;
  sigla?: string;
  lithology?: string;
  age?: string;
  description?: string;
  category: GeodataCategory;
  layerId: string;
  layerLabel: string;
  provider: GeodataProvider;
};

export type GeodataPointQueryResult = {
  lat: number;
  lng: number;
  hits: GeodataPointHit[];
  servicesQueried: string[];
  primarySource: string | null;
};

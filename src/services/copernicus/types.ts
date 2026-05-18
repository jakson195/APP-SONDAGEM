/** Metadados de um produto Sentinel-1 no catálogo OData CDSE. */
export type Wgs84BoundingBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type CopernicusSentinel1Product = {
  copernicusId: string;
  productName: string;
  productType: "SLC";
  acquisitionAt: Date;
  orbitDirection: string;
  /** Footprint em WKT (WGS84), p.ex. POLYGON ou MULTIPOLYGON. */
  footprintWkt: string | null;
  /** Polarização (atributos OData, ex. VV+VH). */
  polarization: string | null;
  s3Path: string | null;
  contentLength: bigint | null;
  downloadUrl: string | null;
  raw: Record<string, unknown>;
};

export type CopernicusTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type?: string;
};

export type ODataProductsResponse = {
  value?: ODataProductRow[];
  "@odata.nextLink"?: string;
};

export type ODataProductRow = {
  Id?: string;
  Name?: string;
  S3Path?: string;
  GeoFootprint?: {
    type?: string;
    coordinates?: number[][][] | number[][][][];
  };
  ContentDate?: { Start?: string; End?: string };
  ContentLength?: number;
  Attributes?: Array<{ Name?: string; Value?: unknown }>;
  "@odata.mediaReadLink"?: string;
  [key: string]: unknown;
};

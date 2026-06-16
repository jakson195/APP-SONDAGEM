export type OutletBasinResult = {
  found: boolean;
  message?: string;
  outlet: { lon: number; lat: number; snapped: boolean };
  river?: {
    id: number;
    name?: string;
    strahler_order?: number;
    basin?: string;
    hyriv_id?: string;
    upstream_area_km2?: number;
    distance_m?: number;
  };
  basin?: {
    id: number;
    code?: string;
    name: string;
    level: "basin" | "region";
    area_km2?: number;
    sub_area_km2?: number;
    geometry?: GeoJSON.Geometry;
  };
};

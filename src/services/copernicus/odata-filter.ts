import type { Wgs84BoundingBox } from "./types";

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Retângulo WGS84 → POLYGON fechado para `OData.CSC.Intersects`.
 */
export function bboxToPolygonWkt4326(b: Wgs84BoundingBox): string {
  const { minLon, minLat, maxLon, maxLat } = b;
  return (
    "POLYGON((" +
    `${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}` +
    "))"
  );
}

/** Resolve WKT explícito ou bounding box (WGS84). */
export function resolveSentinel1AreaWkt(input: {
  aoiWkt?: string | null;
  bbox?: Wgs84BoundingBox | null;
}): string {
  const wkt = input.aoiWkt?.trim();
  if (wkt) return wkt;
  if (input.bbox != null) return bboxToPolygonWkt4326(input.bbox);
  throw new Error("Sentinel-1: indique `aoiWkt` (WKT 4326) ou `bbox` (WGS84).");
}

/**
 * Filtro OData (SENTINEL-1 + **SLC** + interseção + período + órbita opcional).
 * Igual ao critério em `digital-twin/server/services/insar/sentinel1.py`.
 */
export function buildSentinel1SlcODataFilter(params: {
  aoiWkt: string;
  dateFrom: Date;
  dateTo: Date;
  orbitDirection?: "ASC" | "DESC" | null;
}): string {
  const start = `${ymdUtc(params.dateFrom)}T00:00:00.000Z`;
  const end = `${ymdUtc(params.dateTo)}T23:59:59.999Z`;

  const parts = [
    "Collection/Name eq 'SENTINEL-1'",
    "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType'" +
      " and att/OData.CSC.StringAttribute/Value eq 'SLC')",
    `ContentDate/Start gt ${start}`,
    `ContentDate/Start lt ${end}`,
    `OData.CSC.Intersects(area=geography'SRID=4326;${params.aoiWkt}')`,
  ];

  if (params.orbitDirection) {
    const o = params.orbitDirection.toUpperCase();
    parts.push(
      "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'orbitDirection'" +
        ` and att/OData.CSC.StringAttribute/Value eq '${o}')`,
    );
  }

  return parts.join(" and ");
}

/** Converte `GeoJSON.Polygon` em WKT SRID 4326 (anel exterior). */
export function geoJsonPolygonToWkt(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const o = input as { type?: string; coordinates?: unknown };
  if (o.type !== "Polygon") return null;
  const ring = o.coordinates as number[][][] | undefined;
  const outer = ring?.[0];
  if (!outer?.length || outer.length < 4) return null;
  const pairs = outer
    .map(([lon, lat]) => `${Number(lon)} ${Number(lat)}`)
    .join(", ");
  return `POLYGON((${pairs}))`;
}

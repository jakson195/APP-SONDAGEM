/** Base das rotas geoespaciais no monólito (`src/app/api/geo/`). */
export function resolveGeoApiBase(): string {
  if (typeof window !== "undefined") {
    return (process.env.NEXT_PUBLIC_GEO_API_URL ?? "/api/geo").replace(/\/$/, "");
  }
  return "/api/geo";
}

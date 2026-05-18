/** Base da API geoespacial no mesmo origin (monólito, porta 3000). */
export function geoApiBase(): string {
  const base =
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_GEO_API_URL
      : undefined) ?? "/api/geo";
  return base.replace(/\/$/, "");
}

export function geoApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${geoApiBase()}${p}`;
}

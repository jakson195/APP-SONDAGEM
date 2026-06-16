/** Base URLs — Vite :5175 usa /api/v1; DataGeo usa proxy /api/hidrogeo. */

const DATAGEO_EMBEDDED_PREFIXES = [
  "/hidrogeo-viewer",
  "/hidrologia/hidrogeo-brasil",
] as const;

function matchesDataGeoEmbeddedPath(pathname: string): boolean {
  return DATAGEO_EMBEDDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Viewer servido via proxy Next (iframe DataGeo) — não Vite directo :5175. */
function isDataGeoHidroGeoProxy(): boolean {
  if (typeof window === "undefined") return false;
  const { pathname, port } = window.location;
  if (port === "5175") return false;
  if (pathname.startsWith("/hidrogeo-viewer")) return true;
  return matchesDataGeoEmbeddedPath(pathname);
}

function sanitizeLegacyApiUrl(raw: string): string {
  const base = raw.replace(/\/$/, "");
  // Porta legada errada (Digital Twin / HidroAlerta) — HidroGeo API é :8010 via proxy Vite
  if (/:8000(\/|$)/.test(base)) return "/api/v1";
  return base;
}

export function getApiBase(): string {
  if (isDataGeoHidroGeoProxy()) {
    return "/api/hidrogeo/v1";
  }
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) return sanitizeLegacyApiUrl(fromEnv);
  return "/api/v1";
}

export function getTilesBase(): string {
  if (isDataGeoHidroGeoProxy()) {
    return "/tiles/hidrogeo";
  }
  const fromEnv = import.meta.env.VITE_TILESERV_URL?.trim();
  if (fromEnv) {
    const base = fromEnv.replace(/\/$/, "");
    if (/:8000(\/|$)/.test(base)) return "/tiles";
    return base;
  }
  return "/tiles";
}

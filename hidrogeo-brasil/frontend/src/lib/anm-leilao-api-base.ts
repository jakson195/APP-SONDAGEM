/** API e tiles ANM Leilão — rotas próprias no DataGeo (sem /api/hidrogeo). */

export function isAnmLeilaoViewerPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/anm-leilao-viewer");
}

function isDataGeoAnmProxy(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, port, pathname } = window.location;
  if (!pathname.includes("/anm-leilao-viewer")) return false;
  if (port === "5175") return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return port !== "5175";
  }
  return true;
}

export function getAnmLeilaoApiBase(): string {
  if (isDataGeoAnmProxy()) return "/api/anm-leilao/v1";
  return "/api/v1";
}

export function getAnmLeilaoTilesBase(): string {
  if (isDataGeoAnmProxy()) return "/tiles/anm-leilao";
  return "/tiles";
}

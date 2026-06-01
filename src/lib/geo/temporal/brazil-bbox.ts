import type { Wgs84Bbox } from "./temporal-types";

/** Extensão aproximada do território brasileiro (WGS84). */
export const BRAZIL_BOUNDS: Wgs84Bbox = {
  west: -74.0,
  south: -33.75,
  east: -34.0,
  north: 5.27,
};

/** Centro geográfico do Brasil — ponto inicial do mapa. */
export const BRAZIL_CENTER = {
  lat: -14.235,
  lng: -51.925,
  label: "Brasil (centro)",
};

const HALF_DEG_DEFAULT = 0.06;

export function bboxFromCenter(
  lat: number,
  lng: number,
  halfDeg = HALF_DEG_DEFAULT,
): Wgs84Bbox {
  return {
    west: lng - halfDeg,
    east: lng + halfDeg,
    south: lat - halfDeg,
    north: lat + halfDeg,
  };
}

export function bboxCenter(bbox: Wgs84Bbox): { lat: number; lng: number } {
  return {
    lat: (bbox.north + bbox.south) / 2,
    lng: (bbox.east + bbox.west) / 2,
  };
}

export function isPointInBrazil(lat: number, lng: number): boolean {
  return (
    lat >= BRAZIL_BOUNDS.south &&
    lat <= BRAZIL_BOUNDS.north &&
    lng >= BRAZIL_BOUNDS.west &&
    lng <= BRAZIL_BOUNDS.east
  );
}

export function clampBboxToBrazil(bbox: Wgs84Bbox): Wgs84Bbox {
  const west = Math.max(BRAZIL_BOUNDS.west, Math.min(bbox.west, bbox.east));
  const east = Math.min(BRAZIL_BOUNDS.east, Math.max(bbox.west, bbox.east));
  const south = Math.max(BRAZIL_BOUNDS.south, Math.min(bbox.south, bbox.north));
  const north = Math.min(BRAZIL_BOUNDS.north, Math.max(bbox.south, bbox.north));
  return { west, south, east, north };
}

/** Bbox de estudo centrada no mapa (tamanho fixo — ideal para STAC). */
export function bboxFromMapCenter(
  lat: number,
  lng: number,
  halfDeg = HALF_DEG_DEFAULT,
): Wgs84Bbox {
  const clampLat = Math.max(
    BRAZIL_BOUNDS.south + halfDeg,
    Math.min(BRAZIL_BOUNDS.north - halfDeg, lat),
  );
  const clampLng = Math.max(
    BRAZIL_BOUNDS.west + halfDeg,
    Math.min(BRAZIL_BOUNDS.east - halfDeg, lng),
  );
  return clampBboxToBrazil(bboxFromCenter(clampLat, clampLng, halfDeg));
}

export function defaultBrazilStudyBbox(): Wgs84Bbox {
  return bboxFromCenter(BRAZIL_CENTER.lat, BRAZIL_CENTER.lng);
}

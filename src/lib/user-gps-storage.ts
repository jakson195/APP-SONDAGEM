/** Opções de leitura GPS: `maximumAge` alto permite fix em cache do SO/navegador (útil sem rede). */
export const FIELD_GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 24000,
  maximumAge: 86_400_000, // 24 h
};

const STORAGE_KEY = "vision-app-sondagem-user-gps-v1";

export type StoredUserLatLng = {
  lat: number;
  lng: number;
  savedAt: number;
};

/** Ignora entradas com mais de 1 ano (evita lixo eterno). */
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export function readStoredUserLatLng(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<StoredUserLatLng>;
    if (
      typeof o.lat !== "number" ||
      typeof o.lng !== "number" ||
      !Number.isFinite(o.lat) ||
      !Number.isFinite(o.lng) ||
      o.lat < -90 ||
      o.lat > 90 ||
      o.lng < -180 ||
      o.lng > 180
    ) {
      return null;
    }
    if (
      typeof o.savedAt === "number" &&
      Number.isFinite(o.savedAt) &&
      Date.now() - o.savedAt > MAX_AGE_MS
    ) {
      return null;
    }
    return { lat: o.lat, lng: o.lng };
  } catch {
    return null;
  }
}

export function writeStoredUserLatLng(lat: number, lng: number): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredUserLatLng = {
      lat,
      lng,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
}

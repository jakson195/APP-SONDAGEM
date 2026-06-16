import { Ion } from "cesium";

let configured = false;

export function configureCesiumIon(): boolean {
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
  if (token) {
    Ion.defaultAccessToken = token;
    configured = true;
    return true;
  }
  configured = false;
  return false;
}

export function hasIonToken(): boolean {
  return configured || Boolean(import.meta.env.VITE_CESIUM_ION_TOKEN?.trim());
}

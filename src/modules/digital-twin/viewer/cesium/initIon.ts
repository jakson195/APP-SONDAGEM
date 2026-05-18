import { Ion } from "cesium";

let configured = false;

function readCesiumIonToken(): string {
  const fromNext =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN?.trim()
      : "";
  if (fromNext) return fromNext;
  try {
    const vite = (
      import.meta as unknown as {
        env?: { VITE_CESIUM_ION_TOKEN?: string };
      }
    ).env?.VITE_CESIUM_ION_TOKEN?.trim();
    return vite ?? "";
  } catch {
    return "";
  }
}

export function configureCesiumIon(): boolean {
  const token = readCesiumIonToken();
  if (token) {
    Ion.defaultAccessToken = token;
    configured = true;
    return true;
  }
  configured = false;
  return false;
}

export function hasIonToken(): boolean {
  return configured || Boolean(readCesiumIonToken());
}

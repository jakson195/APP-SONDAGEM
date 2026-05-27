/** Monólito: viewer e API geoespacial no mesmo origin (porta 3000). */

export function getDigitalTwinViewerUrl(): string {
  return "/digital-twin";
}

export function getDigitalTwinOrthoUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_DIGITAL_TWIN_ORTHO_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3001";
}

export function getDigitalTwinApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_GEO_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "/api/geo";
}

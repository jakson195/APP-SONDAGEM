/** Graus decimais WGS84 a partir de texto (vírgula ou ponto). */
export function wgsPairFromInputs(
  latStr: string,
  lngStr: string,
): { lat: number; lng: number } | null {
  const lat = parseGrau(latStr);
  const lng = parseGrau(lngStr);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseGrau(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

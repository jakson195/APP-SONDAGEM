import { latLonToUtm, utmToLatLonHemisphere } from "@/lib/utm";
import { wgsPairFromInputs } from "@/lib/spt-map-coords";

export type FusoUtmParsed = {
  zoneNum: number;
  southern: boolean;
};

/** Formato pt-BR para relatório (2 decimais). */
export function formatarCoordUtmMetros(m: number): string {
  return m.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseNumeroCoord(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Interpreta fuso: "22S", "22 S", "22", "UTM 22S". */
export function parseFusoUtm(fuso: string): FusoUtmParsed | null {
  const t = fuso.trim().toUpperCase().replace(/\s+/g, "");
  const m = t.match(/^(?:UTM)?(\d{1,2})([NS])?$/i) ?? t.match(/^(\d{1,2})$/);
  if (!m) return null;
  const zoneNum = Number(m[1]);
  if (!Number.isFinite(zoneNum) || zoneNum < 1 || zoneNum > 60) return null;
  const hem = (m[2] ?? "S").toUpperCase();
  return { zoneNum, southern: hem !== "N" };
}

export function labelFusoUtm(zoneNum: number, southern: boolean): string {
  return `${zoneNum}${southern ? "S" : "N"}`;
}

export type CoordenadasUtmNE = {
  norte: string;
  este: string;
  fuso: string;
};

/** WGS84 → UTM (N/E + fuso). */
export function utmDeWgs84(
  lat: number,
  lng: number,
  fusoPreferido?: string,
): CoordenadasUtmNE | null {
  const fusoParsed = fusoPreferido?.trim()
    ? parseFusoUtm(fusoPreferido)
    : null;
  const utm = latLonToUtm(
    lat,
    lng,
    fusoParsed?.zoneNum,
  );
  if (!utm) return null;
  const southern = utm.zoneLetter
    ? utm.zoneLetter < "N"
    : lat < 0;
  return {
    norte: formatarCoordUtmMetros(utm.northing),
    este: formatarCoordUtmMetros(utm.easting),
    fuso: labelFusoUtm(utm.zoneNum, southern),
  };
}

/** UTM N/E + fuso → WGS84. */
export function wgs84DeUtm(
  norteStr: string,
  esteStr: string,
  fusoStr: string,
): { lat: number; lng: number } | null {
  const n = parseNumeroCoord(norteStr);
  const e = parseNumeroCoord(esteStr);
  const fuso = parseFusoUtm(fusoStr);
  if (n == null || e == null || !fuso) return null;
  const pt = utmToLatLonHemisphere(
    e,
    n,
    fuso.zoneNum,
    !fuso.southern,
    false,
  );
  return pt ? { lat: pt.latitude, lng: pt.longitude } : null;
}

export function wgsDeInputsLatLng(
  latStr: string,
  lngStr: string,
): { lat: number; lng: number } | null {
  return wgsPairFromInputs(latStr, lngStr);
}

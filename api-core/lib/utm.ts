import { fromLatLon, toLatLon } from "utm";

export type Wgs84Point = {
  latitude: number;
  longitude: number;
};

export type UtmCoordinates = {
  easting: number;
  northing: number;
  zoneNum: number;
  zoneLetter: string;
};

/**
 * WGS84 geographic → UTM (WGS84). `forceZoneNum` (1–60) fixes the zone instead of auto from lon.
 * Returns `null` if inputs are out of range or conversion fails.
 */
export function latLonToUtm(
  latitude: number,
  longitude: number,
  forceZoneNum?: number,
): UtmCoordinates | null {
  try {
    const r = fromLatLon(latitude, longitude, forceZoneNum);
    if (r.zoneLetter == null) return null;
    return {
      easting: r.easting,
      northing: r.northing,
      zoneNum: r.zoneNum,
      zoneLetter: r.zoneLetter,
    };
  } catch {
    return null;
  }
}

/**
 * UTM → WGS84 using zone number + letter (e.g. 22, "J").
 * `strict: false` relaxes easting/northing bounds (useful for edge UI values).
 */
export function utmToLatLon(
  easting: number,
  northing: number,
  zoneNum: number,
  zoneLetter: string,
  strict = true,
): Wgs84Point | null {
  try {
    const letter = zoneLetter.trim().toUpperCase();
    if (letter.length !== 1) return null;
    const r = toLatLon(easting, northing, zoneNum, letter, undefined, strict);
    return { latitude: r.latitude, longitude: r.longitude };
  } catch {
    return null;
  }
}

/**
 * UTM → WGS84 using zone number + hemisphere flag (`northern` = above equator).
 */
export function utmToLatLonHemisphere(
  easting: number,
  northing: number,
  zoneNum: number,
  northern: boolean,
  strict = true,
): Wgs84Point | null {
  try {
    const r = toLatLon(easting, northing, zoneNum, undefined, northern, strict);
    return { latitude: r.latitude, longitude: r.longitude };
  } catch {
    return null;
  }
}

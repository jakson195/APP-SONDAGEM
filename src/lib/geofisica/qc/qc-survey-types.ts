import type { Dipolo2DReading } from "../dipolo2d/types";

export type QcSurveyLine = {
  id: string;
  name: string;
  readings: Dipolo2DReading[];
  /** Centro WGS84 para mapa. */
  anchorLat: number;
  anchorLng: number;
  /** Azimute do perfil (° a partir do N). */
  azimuthDeg: number;
  /** Comprimento do perfil (m). */
  profileLengthM: number;
};

export function defaultQcLine(name = "Linha 1"): QcSurveyLine {
  return {
    id: crypto.randomUUID(),
    name,
    readings: [],
    anchorLat: -26.3,
    anchorLng: -48.65,
    azimuthDeg: 90,
    profileLengthM: 200,
  };
}

export function profilePointWgs84(
  line: QcSurveyLine,
  stationM: number,
): { lat: number; lng: number } {
  const t = Math.max(0, Math.min(1, stationM / Math.max(line.profileLengthM, 1)));
  const distM = t * line.profileLengthM;
  const rad = (line.azimuthDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(rad)) / 111_320;
  const dLng =
    (distM * Math.sin(rad)) /
    (111_320 * Math.cos((line.azimuthDeg * Math.PI) / 180));
  return {
    lat: line.anchorLat + dLat,
    lng: line.anchorLng + dLng,
  };
}

export function lineEndWgs84(line: QcSurveyLine): { lat: number; lng: number } {
  return profilePointWgs84(line, line.profileLengthM);
}

/**
 * Importação KML/KMZ — posição de linhas geofísicas no mapa (WGS84).
 */

import { azimuthDegFromEndpoints } from "./line-geometry-3d";
import { newLineId } from "./survey-line-factory";
import type { SurveyLineGeometry } from "./volume3d-types";

export type KmlCoord = {
  lat: number;
  lng: number;
  elevM?: number;
};

export type KmlSurveyLineFeature = {
  name: string;
  coordinates: KmlCoord[];
  source: "linestring" | "track" | "points";
};

/** Percurso KML/KMZ importado — mantido no mapa até ser associado a uma secção. */
export type ImportedKmlTrack = KmlSurveyLineFeature & {
  id: string;
  fileName: string;
  featureIndex: number;
  color: string;
};

export const KML_TRACK_COLORS = [
  "#a855f7",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#eab308",
  "#ef4444",
  "#22c55e",
] as const;

export type KmlParseResult = {
  lines: KmlSurveyLineFeature[];
  warnings: string[];
};

function parseCoordinateTuples(text: string): KmlCoord[] {
  const out: KmlCoord[] = [];
  const chunks = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const chunk of chunks) {
    const parts = chunk.split(",").map((s) => Number(s.trim()));
    const lng = parts[0];
    const lat = parts[1];
    const elev = parts[2];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      lng: lng!,
      lat: lat!,
      elevM: Number.isFinite(elev) ? elev : undefined,
    });
  }
  return out;
}

function placemarkName(placemark: Element): string {
  return (
    placemark.getElementsByTagName("name")[0]?.textContent?.trim() ?? ""
  );
}

function lineStringsInContainer(container: Element): Element[] {
  const found: Element[] = [];
  for (const tag of ["LineString", "gx:LineString"]) {
    found.push(...Array.from(container.getElementsByTagName(tag)));
  }
  return found;
}

function tracksInContainer(container: Element): Element[] {
  const found: Element[] = [];
  for (const tag of ["gx:Track", "Track"]) {
    found.push(...Array.from(container.getElementsByTagName(tag)));
  }
  return found;
}

function coordsFromTrack(track: Element): KmlCoord[] {
  const coords: string[] = [];
  for (const tag of ["gx:coord", "coord"]) {
    const nodes = track.getElementsByTagName(tag);
    for (let i = 0; i < nodes.length; i++) {
      const t = nodes[i]?.textContent?.trim();
      if (t) coords.push(t);
    }
  }
  if (coords.length >= 2) {
    return coords.flatMap((c) => {
      const parts = c.split(/\s+/).map(Number);
      const lng = parts[0];
      const lat = parts[1];
      const elev = parts[2];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [
        {
          lng: lng!,
          lat: lat!,
          elevM: Number.isFinite(elev) ? elev : undefined,
        },
      ];
    });
  }
  const when = track.getElementsByTagName("coordinates")[0]?.textContent;
  return when ? parseCoordinateTuples(when) : [];
}

function pointsInPlacemark(placemark: Element): KmlCoord[] {
  const point = placemark.getElementsByTagName("Point")[0];
  const raw = point?.getElementsByTagName("coordinates")[0]?.textContent;
  if (!raw) return [];
  return parseCoordinateTuples(raw);
}

export function parseKmlSurveyLines(kmlText: string): KmlParseResult {
  const warnings: string[] = [];
  const xml = new DOMParser().parseFromString(kmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length > 0) {
    return { lines: [], warnings: ["XML KML inválido ou corrompido."] };
  }

  const lines: KmlSurveyLineFeature[] = [];
  const placemarks = Array.from(xml.getElementsByTagName("Placemark"));

  for (const pm of placemarks) {
    const name = placemarkName(pm) || `Linha ${lines.length + 1}`;

    for (const ls of lineStringsInContainer(pm)) {
      const raw = ls.getElementsByTagName("coordinates")[0]?.textContent;
      if (!raw) continue;
      const coordinates = parseCoordinateTuples(raw);
      if (coordinates.length >= 2) {
        lines.push({ name, coordinates, source: "linestring" });
      }
    }

    for (const track of tracksInContainer(pm)) {
      const coordinates = coordsFromTrack(track);
      if (coordinates.length >= 2) {
        lines.push({ name, coordinates, source: "track" });
      }
    }
  }

  if (lines.length === 0) {
    for (const ls of lineStringsInContainer(xml.documentElement)) {
      const raw = ls.getElementsByTagName("coordinates")[0]?.textContent;
      if (!raw) continue;
      const coordinates = parseCoordinateTuples(raw);
      if (coordinates.length >= 2) {
        lines.push({
          name: `Linha ${lines.length + 1}`,
          coordinates,
          source: "linestring",
        });
      }
    }
  }

  if (lines.length === 0) {
    const pointCoords: KmlCoord[] = [];
    for (const pm of placemarks) {
      pointCoords.push(...pointsInPlacemark(pm));
    }
    if (pointCoords.length >= 2) {
      lines.push({
        name: placemarkName(placemarks[0]!) || "Linha importada",
        coordinates: pointCoords,
        source: "points",
      });
      if (pointCoords.length > 2) {
        warnings.push(
          "Sem LineString — usados vários pontos: A=primeiro, B=último.",
        );
      }
    }
  }

  return { lines, warnings };
}

export async function extractKmlTextFromFile(file: File): Promise<string | null> {
  const lower = file.name.toLowerCase();
  const isKmz =
    file.type === "application/vnd.google-earth.kmz" ||
    lower.endsWith(".kmz");
  if (!isKmz) return file.text();

  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const kmlEntry =
    Object.keys(zip).find((name) => /(^|\/)doc\.kml$/i.test(name)) ??
    Object.keys(zip).find((name) => /\.kml$/i.test(name));
  if (!kmlEntry) return null;
  return strFromU8(zip[kmlEntry]!, true);
}

export async function parseKmlKmzFile(file: File): Promise<KmlParseResult> {
  const kmlText = await extractKmlTextFromFile(file);
  if (!kmlText) {
    return { lines: [], warnings: ["KMZ sem ficheiro KML interno."] };
  }
  return parseKmlSurveyLines(kmlText);
}

export function featureToImportedTrack(
  feature: KmlSurveyLineFeature,
  fileName: string,
  featureIndex: number,
  id: string,
  color: string,
): ImportedKmlTrack {
  return { ...feature, id, fileName, featureIndex, color };
}

/** Importa vários ficheiros KML/KMZ — acumula percursos (não substitui secções). */
export async function parseKmlKmzFiles(
  files: File[],
  colorOffset = 0,
): Promise<{ tracks: ImportedKmlTrack[]; warnings: string[] }> {
  const tracks: ImportedKmlTrack[] = [];
  const warnings: string[] = [];
  let colorIdx = colorOffset;

  for (const file of files) {
    const { lines, warnings: w } = await parseKmlKmzFile(file);
    warnings.push(...w.map((msg) => `${file.name}: ${msg}`));
    if (lines.length === 0) {
      warnings.push(`${file.name}: nenhum percurso encontrado.`);
      continue;
    }
    lines.forEach((feat, i) => {
      tracks.push(
        featureToImportedTrack(
          feat,
          file.name,
          i,
          newLineId(),
          KML_TRACK_COLORS[colorIdx % KML_TRACK_COLORS.length]!,
        ),
      );
      colorIdx++;
    });
  }

  return { tracks, warnings };
}

function haversineM(a: KmlCoord, b: KmlCoord): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kmlPathLengthM(coords: KmlCoord[]): number {
  if (coords.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += haversineM(coords[i - 1]!, coords[i]!);
  }
  return sum;
}

/** Converte percurso KML em geometria A→B (WGS84) para linha ERT. */
export function kmlFeatureToSurveyGeometry(
  feature: KmlSurveyLineFeature,
): SurveyLineGeometry {
  const coords = feature.coordinates;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const lengthM = kmlPathLengthM(coords);
  const spacingM = Math.max(
    5,
    Math.min(50, Math.round(lengthM / Math.max(coords.length - 1, 1))),
  );

  const geometry: SurveyLineGeometry = {
    coordMode: "wgs84",
    start: {
      x: first.lat,
      y: first.lng,
      z: first.elevM ?? 0,
    },
    end: {
      x: last.lat,
      y: last.lng,
      z: last.elevM ?? 0,
    },
    spacingM,
    azimuthDeg: azimuthDegFromEndpoints(
      { lat: first.lat, lng: first.lng },
      { lat: last.lat, lng: last.lng },
    ),
  };
  return geometry;
}

/** Topografia opcional a partir de vértices KML (distância acumulada). */
export function kmlFeatureToTopography(
  feature: KmlSurveyLineFeature,
): { stationM: number; elevationM: number }[] | undefined {
  const coords = feature.coordinates;
  if (coords.length < 2) return undefined;
  if (!coords.some((c) => c.elevM != null && Number.isFinite(c.elevM))) {
    return undefined;
  }
  const out: { stationM: number; elevationM: number }[] = [];
  let along = 0;
  out.push({
    stationM: 0,
    elevationM: coords[0]!.elevM ?? 0,
  });
  for (let i = 1; i < coords.length; i++) {
    along += haversineM(coords[i - 1]!, coords[i]!);
    const elev = coords[i]!.elevM;
    if (elev != null && Number.isFinite(elev)) {
      out.push({ stationM: along, elevationM: elev });
    }
  }
  return out.length >= 2 ? out : undefined;
}

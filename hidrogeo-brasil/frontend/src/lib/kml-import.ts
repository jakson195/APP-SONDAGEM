import JSZip from "jszip";
import { kml } from "@tmcw/togeojson";

function parseKmlText(text: string): GeoJSON.FeatureCollection {
  const dom = new DOMParser().parseFromString(text, "text/xml");
  const err = dom.querySelector("parsererror");
  if (err) throw new Error("Ficheiro KML inválido");
  const result = kml(dom) as GeoJSON.FeatureCollection | GeoJSON.Feature;
  const features = result.type === "FeatureCollection" ? result.features : [result];
  return {
    type: "FeatureCollection",
    features: features.filter((f) => f.geometry != null) as GeoJSON.Feature[],
  };
}

export async function parseKmlOrKmzFile(file: File): Promise<GeoJSON.FeatureCollection> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.kmz')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.kml'),
    );
    if (!kmlEntry) throw new Error('KMZ sem ficheiro KML interno');
    return parseKmlText(await kmlEntry.async('text'));
  }
  if (lower.endsWith('.kml')) {
    return parseKmlText(await file.text());
  }
  throw new Error("Use ficheiro .kml ou .kmz");
}

const IMPORT_PALETTE: [number, number, number][] = [
  [251, 146, 60],
  [244, 114, 182],
  [163, 230, 53],
  [250, 204, 21],
  [167, 139, 250],
];

export function colorForImportIndex(index: number): [number, number, number, number] {
  const c = IMPORT_PALETTE[index % IMPORT_PALETTE.length]!;
  return [c[0], c[1], c[2], 210];
}

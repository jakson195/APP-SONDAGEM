import type { CopernicusSentinel1Product, ODataProductRow } from "./types";

function ringCoordsToInnerPairs(ring: number[][]): string {
  return ring.map((c) => `${c[0]} ${c[1]}`).join(", ");
}

function footprintToWkt(geo: ODataProductRow["GeoFootprint"]): string | null {
  if (!geo?.coordinates) return null;
  if (geo.type === "Polygon" && geo.coordinates[0]) {
    const pairs = ringCoordsToInnerPairs(geo.coordinates[0] as number[][]);
    return `POLYGON((${pairs}))`;
  }
  if (geo.type === "MultiPolygon") {
    const coords = geo.coordinates as number[][][][];
    const parts = coords
      .map((poly) => {
        if (!poly[0]) return null;
        const pairs = ringCoordsToInnerPairs(poly[0]);
        return `((${pairs}))`;
      })
      .filter(Boolean);
    if (parts.length === 0) return null;
    return `MULTIPOLYGON(${parts.join(",")})`;
  }
  return null;
}

const POLARIZATION_ATTR_HINTS = [
  "polarisation",
  "polarization",
  "transmitterreceiverpolarisation",
  "polarisationchannels",
];

function extractPolarization(
  attrs: ODataProductRow["Attributes"],
): string | null {
  if (!attrs?.length) return null;
  const values: string[] = [];
  for (const att of attrs) {
    const name = (att.Name ?? "").toLowerCase();
    if (!name) continue;
    const match =
      POLARIZATION_ATTR_HINTS.includes(name) ||
      name.includes("polarisation") ||
      name.includes("polarization");
    if (!match) continue;
    const v = att.Value;
    if (v == null) continue;
    const s = String(v).trim();
    if (s) values.push(s);
  }
  return values.length ? [...new Set(values)].join("; ") : null;
}

export function rowToSentinel1Slc(
  item: ODataProductRow,
  dateFallback: Date,
): CopernicusSentinel1Product | null {
  const name = item.Name ?? "";
  if (!name) return null;
  const sceneId = String(item.Id ?? name);
  const start = item.ContentDate?.Start ?? "";
  let acquisitionAt = dateFallback;
  if (start) {
    const d = new Date(start);
    if (!Number.isNaN(d.getTime())) acquisitionAt = d;
  }
  let orbit = "ASC";
  for (const att of item.Attributes ?? []) {
    if (att.Name === "orbitDirection" && att.Value != null) {
      orbit = String(att.Value).toUpperCase();
    }
  }

  const mediaLink =
    typeof item["@odata.mediaReadLink"] === "string"
      ? (item["@odata.mediaReadLink"] as string)
      : null;

  const len = item.ContentLength;
  const contentLength =
    typeof len === "number" && Number.isFinite(len) ? BigInt(len) : null;

  return {
    copernicusId: sceneId,
    productName: name,
    productType: "SLC",
    acquisitionAt,
    orbitDirection: orbit,
    footprintWkt: footprintToWkt(item.GeoFootprint),
    polarization: extractPolarization(item.Attributes),
    s3Path: item.S3Path ?? null,
    contentLength,
    downloadUrl: mediaLink,
    raw: item as Record<string, unknown>,
  };
}

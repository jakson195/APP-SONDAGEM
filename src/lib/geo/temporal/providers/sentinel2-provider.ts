import axios from "axios";
import { copernicusCredentials, CDSE_ODATA_BASE } from "@/services/copernicus/config";
import { getCopernicusAccessToken } from "@/services/copernicus/auth";
import { bboxToPolygonWkt4326 } from "@/services/copernicus/odata-filter";
import type { TemporalScene, Wgs84Bbox } from "../temporal-types";

type ODataRow = {
  Id: string;
  Name?: string;
  ContentDate?: { Start?: string };
  GeoFootprint?: { type?: string; coordinates?: unknown };
  Attributes?: Array<{
    Name?: string;
    Value?: string | number;
  }>;
};

function cloudFromAttributes(row: ODataRow): number | undefined {
  for (const att of row.Attributes ?? []) {
    if (att.Name === "cloudCover" && typeof att.Value === "number") {
      return att.Value;
    }
  }
  return undefined;
}

function bboxFromFootprint(row: ODataRow, fallback: Wgs84Bbox): Wgs84Bbox {
  const coords = row.GeoFootprint?.coordinates;
  if (!Array.isArray(coords)) return fallback;
  try {
    const flat: number[] = [];
    const walk = (c: unknown) => {
      if (Array.isArray(c)) {
        if (typeof c[0] === "number") flat.push(...(c as number[]));
        else c.forEach(walk);
      }
    };
    walk(coords);
    const lons = flat.filter((_, i) => i % 2 === 0);
    const lats = flat.filter((_, i) => i % 2 === 1);
    if (lons.length === 0 || lats.length === 0) return fallback;
    return {
      west: Math.min(...lons),
      east: Math.max(...lons),
      south: Math.min(...lats),
      north: Math.max(...lats),
    };
  } catch {
    return fallback;
  }
}

export async function searchSentinel2Scenes(params: {
  bbox: Wgs84Bbox;
  dateFrom: string;
  dateTo: string;
  maxCloudPct?: number;
  limit?: number;
}): Promise<TemporalScene[]> {
  const creds = copernicusCredentials();
  if (!creds) return [];

  const { accessToken } = await getCopernicusAccessToken();
  const http = axios.create({
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 45_000,
  });

  const wkt = bboxToPolygonWkt4326({
    minLon: params.bbox.west,
    minLat: params.bbox.south,
    maxLon: params.bbox.east,
    maxLat: params.bbox.north,
  });

  const start = `${params.dateFrom}T00:00:00.000Z`;
  const end = `${params.dateTo}T23:59:59.999Z`;
  const filter = [
    "Collection/Name eq 'SENTINEL-2'",
    "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'S2MSI2A')",
    `ContentDate/Start gt ${start}`,
    `ContentDate/Start lt ${end}`,
    `OData.CSC.Intersects(area=geography'SRID=4326;${wkt}')`,
  ].join(" and ");

  const { data } = await http.get<{ value?: ODataRow[] }>(
    `${CDSE_ODATA_BASE.replace(/\/$/, "")}/Products`,
    {
      params: {
        $filter: filter,
        $top: params.limit ?? 40,
        $orderby: "ContentDate/Start asc",
        $expand: "Attributes",
      },
    },
  );

  const maxCloud = params.maxCloudPct ?? 100;
  const scenes: TemporalScene[] = [];

  for (const row of data.value ?? []) {
    const cloud = cloudFromAttributes(row) ?? 50;
    if (cloud > maxCloud) continue;
    const date = row.ContentDate?.Start?.slice(0, 10) ?? params.dateFrom;
    scenes.push({
      id: row.Id,
      provider: "sentinel2",
      satellite: row.Name?.includes("S2B") ? "Sentinel-2B" : "Sentinel-2A",
      date,
      cloudCoverPct: cloud,
      bounds: bboxFromFootprint(row, params.bbox),
      demo: false,
    });
  }

  return scenes;
}

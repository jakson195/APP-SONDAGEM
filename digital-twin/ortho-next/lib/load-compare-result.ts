import { readFile } from "fs/promises";
import path from "path";

import { OUTPUT_DIR } from "@/lib/paths";
import type { ChangePointsGeoJSON, CompareMeta, CompareResult } from "@/lib/types";

export async function loadCompareResultFromDisk(): Promise<CompareResult | null> {
  const metaPath = path.join(OUTPUT_DIR, "meta.json");
  const pointsPath = path.join(OUTPUT_DIR, "points.geojson");

  try {
    const meta = JSON.parse(await readFile(metaPath, "utf-8")) as CompareMeta;
    const pointsGeoJson = JSON.parse(
      await readFile(pointsPath, "utf-8"),
    ) as ChangePointsGeoJSON;

    return {
      ok: true,
      bounds: meta.bounds,
      pointCount: meta.pointCount,
      heatmapUrl: "/api/files/output/heatmap.png",
      diffUrl: "/api/files/output/diff.tif",
      pointsGeoJson,
    };
  } catch {
    return null;
  }
}

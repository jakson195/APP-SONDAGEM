import { NextResponse } from "next/server";
import {
  buildSentinelHubProcessBody,
  getSentinelHubToken,
  isSentinelHubConfigured,
} from "@/lib/geo/temporal/providers/sentinel-hub-provider";
import {
  requestGeeVisualization,
  isGeeConfigured,
} from "@/lib/geo/temporal/providers/gee-provider";
import type { SpectralIndex, Wgs84Bbox } from "@/lib/geo/temporal/temporal-types";
import { DEFAULT_TEMPORAL_BBOX } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";

const ESRI_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sceneId?: string;
      date?: string;
      index?: SpectralIndex;
      provider?: string;
      bbox?: Wgs84Bbox;
    };

    const bbox = body.bbox ?? DEFAULT_TEMPORAL_BBOX;
    const index = body.index ?? "rgb";
    const date = body.date ?? new Date().toISOString().slice(0, 10);

    if (body.provider === "sentinel_hub" && isSentinelHubConfigured()) {
      const token = await getSentinelHubToken();
      if (token) {
        const processBody = buildSentinelHubProcessBody({
          bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
          date,
          index,
        });
        const res = await fetch(
          "https://services.sentinel-hub.com/api/v1/process",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(processBody),
            signal: AbortSignal.timeout(60_000),
          },
        );
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const b64 = Buffer.from(buf).toString("base64");
          return NextResponse.json({
            ok: true,
            type: "image/png",
            dataUrl: `data:image/png;base64,${b64}`,
            provider: "sentinel_hub",
          });
        }
      }
    }

    if (body.provider === "gee") {
      const gee = await requestGeeVisualization({ bbox, date, index });
      return NextResponse.json({ ...gee, ok: gee.ok });
    }

    return NextResponse.json({
      ok: true,
      type: "xyz",
      tileUrl: ESRI_TILE,
      wmsUrl:
        "https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer",
      wmsLayers: "0",
      provider: body.provider ?? "demo",
      configured: {
        gee: isGeeConfigured(),
        sentinelHub: isSentinelHubConfigured(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro tile temporal";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import type { SpectralIndex } from "../temporal-types";
import { sentinelHubEvalscript } from "../spectral-indices";

export function isSentinelHubConfigured(): boolean {
  return Boolean(
    process.env.SENTINEL_HUB_CLIENT_ID?.trim() &&
      process.env.SENTINEL_HUB_CLIENT_SECRET?.trim(),
  );
}

export async function getSentinelHubToken(): Promise<string | null> {
  const id = process.env.SENTINEL_HUB_CLIENT_ID?.trim();
  const secret = process.env.SENTINEL_HUB_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
  });

  const res = await fetch(
    "https://services.sentinel-hub.com/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export function buildSentinelHubProcessBody(params: {
  bbox: [number, number, number, number];
  date: string;
  index: SpectralIndex;
}): object {
  const end = new Date(`${params.date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    input: {
      bounds: {
        bbox: params.bbox,
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: {
              from: `${params.date}T00:00:00.000Z`,
              to: end.toISOString(),
            },
            maxCloudCoverage: 30,
          },
        },
      ],
    },
    output: {
      width: 512,
      height: 512,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: sentinelHubEvalscript(params.index),
  };
}

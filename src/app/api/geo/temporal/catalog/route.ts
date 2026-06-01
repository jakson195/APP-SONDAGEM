import { NextResponse } from "next/server";
import { fetchTemporalCatalog } from "@/lib/geo/temporal/fetch-temporal-catalog";
import { listProviderCapabilities } from "@/lib/geo/temporal/providers/temporal-providers";
import type {
  TemporalCatalogRequest,
  TemporalProvider,
  Wgs84Bbox,
} from "@/lib/geo/temporal/temporal-types";
import { DEFAULT_TEMPORAL_BBOX, defaultTemporalDateFrom } from "@/lib/geo/temporal/temporal-types";

export const dynamic = "force-dynamic";

function parseBbox(raw: unknown): Wgs84Bbox {
  if (raw && typeof raw === "object") {
    const b = raw as Wgs84Bbox;
    if (
      Number.isFinite(b.west) &&
      Number.isFinite(b.south) &&
      Number.isFinite(b.east) &&
      Number.isFinite(b.north)
    ) {
      return b;
    }
  }
  return DEFAULT_TEMPORAL_BBOX;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bbox = parseBbox({
      west: Number(url.searchParams.get("west")),
      south: Number(url.searchParams.get("south")),
      east: Number(url.searchParams.get("east")),
      north: Number(url.searchParams.get("north")),
    });
    const dateFrom =
      url.searchParams.get("dateFrom") ?? defaultTemporalDateFrom();
    const dateTo = url.searchParams.get("dateTo") ?? new Date().toISOString().slice(0, 10);
    const providersParam = url.searchParams.get("providers");
    const providers = providersParam
      ? (providersParam.split(",") as TemporalProvider[])
      : undefined;

    const catalog = await fetchTemporalCatalog({
      bbox,
      dateFrom,
      dateTo,
      providers,
      maxCloudPct: Number(url.searchParams.get("maxCloud") ?? 40),
      limit: Number(url.searchParams.get("limit") ?? 36),
    });

    return NextResponse.json({
      ok: true,
      ...catalog,
      capabilities: listProviderCapabilities(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro catálogo temporal";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TemporalCatalogRequest;
    const catalog = await fetchTemporalCatalog({
      bbox: parseBbox(body.bbox),
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      providers: body.providers,
      maxCloudPct: body.maxCloudPct,
      limit: body.limit,
    });
    return NextResponse.json({
      ok: true,
      ...catalog,
      capabilities: listProviderCapabilities(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro catálogo temporal";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

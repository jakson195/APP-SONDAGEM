import { NextResponse } from "next/server";

import { obraIdFromGeoProjectId } from "@/lib/geo-project-map";
import { prisma } from "@/lib/prisma";
import { getCopernicusAccessToken } from "@/services/copernicus/auth";
import { copernicusCredentials } from "@/services/copernicus/config";
import { insarSyntheticFallbackEnabled } from "@/services/insar/insar-aoi";
import { snapInsarConfigured } from "@/services/insar/snap-runner";
import { countSentinel1ForInsarWindow } from "@/services/insar/scene-selection";
import { getObraPolygonGeoJson } from "@/lib/obra-area-postgis";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  if (obraId === null) {
    return NextResponse.json({ error: "Projeto inválido" }, { status: 400 });
  }

  const url = new URL(req.url);
  const dateFromStr =
    url.searchParams.get("date_from") ?? url.searchParams.get("dateFrom");
  const dateToStr =
    url.searchParams.get("date_to") ?? url.searchParams.get("dateTo");
  const orbitRaw =
    url.searchParams.get("orbit") ??
    url.searchParams.get("orbit_direction") ??
    "";

  const dateFrom = dateFromStr ? new Date(dateFromStr) : new Date("2024-01-01");
  const dateTo = dateToStr ? new Date(dateToStr) : new Date();
  const orbitDirection =
    orbitRaw === "ASC" || orbitRaw === "DESC" ? orbitRaw : null;

  const obra = await prisma.obra.findUnique({
    where: { id: obraId },
    select: {
      id: true,
      nome: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const obraAoiPoly = await getObraPolygonGeoJson(prisma, obraId);

  const catalog = await countSentinel1ForInsarWindow({
    obraId,
    dateFrom,
    dateTo,
    orbitDirection,
  });

  const creds = copernicusCredentials();
  let copernicus: {
    credentialsConfigured: boolean;
    usernameHint: string | null;
    tokenOk: boolean;
    expiresInSec?: number;
    tokenError?: string;
  } = {
    credentialsConfigured: Boolean(creds),
    usernameHint: creds ? `${creds.username.slice(0, 3)}…` : null,
    tokenOk: false,
  };

  if (creds) {
    try {
      const t = await getCopernicusAccessToken();
      copernicus = {
        ...copernicus,
        tokenOk: true,
        expiresInSec: t.expiresInSec,
      };
    } catch (e) {
      copernicus = {
        ...copernicus,
        tokenOk: false,
        tokenError: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const syntheticFallbackEnabled = insarSyntheticFallbackEnabled();

  return NextResponse.json({
    obraId,
    obraNome: obra.nome,
    period: {
      date_from: dateFrom.toISOString(),
      date_to: dateTo.toISOString(),
      orbit: orbitDirection ?? "qualquer",
    },
    aoi: {
      obra_geojson_aoi: obraAoiPoly != null,
      obra_coordinates:
        obra.latitude != null &&
        obra.longitude != null &&
        Number.isFinite(obra.latitude) &&
        Number.isFinite(obra.longitude),
    },
    catalog: {
      total_entries: catalog.total,
      ready_slc_local: catalog.readySlc,
      pair_ready: catalog.readySlc >= 2,
    },
    copernicus,
    processing: {
      snap_configured: snapInsarConfigured(),
      synthetic_fallback_enabled: syntheticFallbackEnabled,
    },
    cesium: {
      note:
        "Em estado completed, o painel carrega raster por insarGeotiffUrl e layerManager.addInsarGeotiff (heatmap + timeline).",
    },
  });
}

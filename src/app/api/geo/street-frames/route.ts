import { NextResponse } from "next/server";

import { nextResponseDbFailure } from "@/lib/db-route-error";
import { listStreetFramesSql } from "@/lib/geo-media-sql";
import { resolveGeoScopeFromRequest } from "@/lib/geo-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = await resolveGeoScopeFromRequest(req, {
    companyId: url.searchParams.get("companyId"),
    obraId: url.searchParams.get("obraId"),
  });
  if (!scope.ok) return scope.response;

  try {
    const rows = await listStreetFramesSql(prisma, scope.scope);
    return NextResponse.json(rows);
  } catch (error) {
    return nextResponseDbFailure(error);
  }
}

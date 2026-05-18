import type { PrismaClient } from "@prisma/client";
import type { Polygon } from "geojson";

import {
  shouldPersistObraAoiAsGeoJsonOnly,
} from "@/lib/pg-error-utils";

async function clearObraAoiGeoJsonColumn(
  prisma: PrismaClient,
  obraId: number,
): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "Obra" SET "area_of_interest_geojson" = NULL WHERE "id" = ${obraId}
    `;
  } catch {
    /* Coluna JSON opcional / em falta */
  }
}

async function setObraAoiGeoJsonColumn(
  prisma: PrismaClient,
  obraId: number,
  polygon: Polygon,
): Promise<void> {
  const gj = JSON.stringify(polygon);
  await prisma.$executeRaw`
    UPDATE "Obra"
    SET "area_of_interest_geojson" = ${gj}::jsonb
    WHERE "id" = ${obraId}
  `;
}

/** Persiste AOI: PostGIS quando disponível; senão `area_of_interest_geojson` (JSONB), sempre via SQL cru (compatível com client Prisma antigo). */
export async function setObraPolygon4326(
  prisma: PrismaClient,
  obraId: number,
  polygon: Polygon,
): Promise<void> {
  const gj = JSON.stringify(polygon);

  try {
    await prisma.$executeRaw`
      UPDATE "Obra"
      SET "area_of_interest" = ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${gj}::text), 4326))
      WHERE "id" = ${obraId}
    `;
    await clearObraAoiGeoJsonColumn(prisma, obraId);
    return;
  } catch (e) {
    if (!shouldPersistObraAoiAsGeoJsonOnly(e)) throw e;
  }

  await setObraAoiGeoJsonColumn(prisma, obraId, polygon);

  try {
    await prisma.$executeRaw`
      UPDATE "Obra" SET "area_of_interest" = NULL WHERE "id" = ${obraId}
    `;
  } catch {
    /* coluna geometry pode não existir */
  }
}

export async function clearObraPolygon4326(
  prisma: PrismaClient,
  obraId: number,
): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "Obra" SET "area_of_interest" = NULL WHERE "id" = ${obraId}
    `;
  } catch {
    /* PostGIS / coluna em falta */
  }

  await clearObraAoiGeoJsonColumn(prisma, obraId);
}

export async function getObraPolygonGeoJson(
  prisma: PrismaClient,
  obraId: number,
): Promise<Polygon | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ j: unknown }>>`
      SELECT ST_AsGeoJSON("area_of_interest")::json AS j
      FROM "Obra"
      WHERE "id" = ${obraId}
    `;
    const row = rows[0];
    if (row?.j && typeof row.j === "object" && !Array.isArray(row.j)) {
      const g = row.j as { type?: string };
      if (g.type === "Polygon") return row.j as Polygon;
    }
  } catch {
    /* PostGIS indisponível ou coluna geometry em falta */
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ j: unknown }>>`
      SELECT "area_of_interest_geojson" AS j FROM "Obra" WHERE "id" = ${obraId}
    `;
    const raw = rows[0]?.j;
    if (raw == null) return null;
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed as Polygon).type === "Polygon"
    ) {
      return parsed as Polygon;
    }
  } catch {
    /* Coluna JSON em falta ou valor inválido */
  }

  return null;
}

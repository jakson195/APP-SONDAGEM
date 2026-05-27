import type { Prisma, PrismaClient } from "@prisma/client";

type JsonLike = Record<string, unknown> | null;

type GeoPhotoRow = {
  id: number;
  companyId: number;
  obraId: number | null;
  uploadedByUserId: number | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  imageUrl: string;
  storagePath: string;
  originalName: string | null;
  capturedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
};

type StreetFrameRow = {
  id: string;
  companyId: number;
  obraId: number | null;
  uploadedByUserId: number | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  imageUrl: string;
  storagePath: string;
  videoId: string;
  frameIndex: number;
  timestamp: Date | null;
  metadata: unknown;
  createdAt: Date;
};

export type GeoPhotoRecord = {
  id: number;
  companyId: number;
  obraId: number | null;
  uploadedByUserId: number | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  imageUrl: string;
  storagePath: string;
  originalName: string | null;
  capturedAt: string | null;
  metadata: JsonLike;
  createdAt: string;
};

export type StreetFrameRecord = {
  id: string;
  companyId: number;
  obraId: number | null;
  uploadedByUserId: number | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  imageUrl: string;
  storagePath: string;
  videoId: string;
  frameIndex: number;
  timestamp: string | null;
  metadata: JsonLike;
  createdAt: string;
};

type SqlExecutor = PrismaClient | Prisma.TransactionClient;

function normalizeJson(value: unknown): JsonLike {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapGeoPhotoRow(row: GeoPhotoRow): GeoPhotoRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    obraId: row.obraId,
    uploadedByUserId: row.uploadedByUserId,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude,
    imageUrl: row.imageUrl,
    storagePath: row.storagePath,
    originalName: row.originalName,
    capturedAt: row.capturedAt ? row.capturedAt.toISOString() : null,
    metadata: normalizeJson(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapStreetFrameRow(row: StreetFrameRow): StreetFrameRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    obraId: row.obraId,
    uploadedByUserId: row.uploadedByUserId,
    latitude: row.latitude,
    longitude: row.longitude,
    heading: row.heading,
    imageUrl: row.imageUrl,
    storagePath: row.storagePath,
    videoId: row.videoId,
    frameIndex: row.frameIndex,
    timestamp: row.timestamp ? row.timestamp.toISOString() : null,
    metadata: normalizeJson(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listGeoPhotosSql(
  prisma: SqlExecutor,
  options: { companyId: number; obraId?: number | null },
): Promise<GeoPhotoRecord[]> {
  const rows = options.obraId
    ? await prisma.$queryRaw<GeoPhotoRow[]>`
        SELECT
          "id",
          "company_id" AS "companyId",
          "obra_id" AS "obraId",
          "uploaded_by_user_id" AS "uploadedByUserId",
          "latitude",
          "longitude",
          "altitude",
          "image_url" AS "imageUrl",
          "storage_path" AS "storagePath",
          "original_name" AS "originalName",
          "captured_at" AS "capturedAt",
          "metadata",
          "created_at" AS "createdAt"
        FROM "geo_photos"
        WHERE "company_id" = ${options.companyId} AND "obra_id" = ${options.obraId}
        ORDER BY COALESCE("captured_at", "created_at") DESC, "id" DESC
      `
    : await prisma.$queryRaw<GeoPhotoRow[]>`
        SELECT
          "id",
          "company_id" AS "companyId",
          "obra_id" AS "obraId",
          "uploaded_by_user_id" AS "uploadedByUserId",
          "latitude",
          "longitude",
          "altitude",
          "image_url" AS "imageUrl",
          "storage_path" AS "storagePath",
          "original_name" AS "originalName",
          "captured_at" AS "capturedAt",
          "metadata",
          "created_at" AS "createdAt"
        FROM "geo_photos"
        WHERE "company_id" = ${options.companyId}
        ORDER BY COALESCE("captured_at", "created_at") DESC, "id" DESC
      `;

  return rows.map(mapGeoPhotoRow);
}

export async function insertGeoPhotoSql(
  prisma: SqlExecutor,
  input: {
    companyId: number;
    obraId?: number | null;
    uploadedByUserId?: number | null;
    latitude: number;
    longitude: number;
    altitude?: number | null;
    imageUrl: string;
    storagePath: string;
    originalName?: string | null;
    capturedAt?: Date | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<GeoPhotoRecord> {
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
  const rows = await prisma.$queryRaw<GeoPhotoRow[]>`
    INSERT INTO "geo_photos" (
      "company_id",
      "obra_id",
      "uploaded_by_user_id",
      "latitude",
      "longitude",
      "altitude",
      "image_url",
      "storage_path",
      "original_name",
      "captured_at",
      "metadata"
    )
    VALUES (
      ${input.companyId},
      ${input.obraId ?? null},
      ${input.uploadedByUserId ?? null},
      ${input.latitude},
      ${input.longitude},
      ${input.altitude ?? null},
      ${input.imageUrl},
      ${input.storagePath},
      ${input.originalName ?? null},
      ${input.capturedAt ?? null},
      ${metadataJson}::jsonb
    )
    RETURNING
      "id",
      "company_id" AS "companyId",
      "obra_id" AS "obraId",
      "uploaded_by_user_id" AS "uploadedByUserId",
      "latitude",
      "longitude",
      "altitude",
      "image_url" AS "imageUrl",
      "storage_path" AS "storagePath",
      "original_name" AS "originalName",
      "captured_at" AS "capturedAt",
      "metadata",
      "created_at" AS "createdAt"
  `;

  return mapGeoPhotoRow(rows[0]!);
}

export async function listStreetFramesSql(
  prisma: SqlExecutor,
  options: { companyId: number; obraId?: number | null },
): Promise<StreetFrameRecord[]> {
  const rows = options.obraId
    ? await prisma.$queryRaw<StreetFrameRow[]>`
        SELECT
          "id",
          "company_id" AS "companyId",
          "obra_id" AS "obraId",
          "uploaded_by_user_id" AS "uploadedByUserId",
          "latitude",
          "longitude",
          "heading",
          "image_url" AS "imageUrl",
          "storage_path" AS "storagePath",
          "video_id" AS "videoId",
          "frame_index" AS "frameIndex",
          "timestamp",
          "metadata",
          "created_at" AS "createdAt"
        FROM "street_frames"
        WHERE "company_id" = ${options.companyId} AND "obra_id" = ${options.obraId}
        ORDER BY COALESCE("timestamp", "created_at") DESC, "frame_index" ASC
      `
    : await prisma.$queryRaw<StreetFrameRow[]>`
        SELECT
          "id",
          "company_id" AS "companyId",
          "obra_id" AS "obraId",
          "uploaded_by_user_id" AS "uploadedByUserId",
          "latitude",
          "longitude",
          "heading",
          "image_url" AS "imageUrl",
          "storage_path" AS "storagePath",
          "video_id" AS "videoId",
          "frame_index" AS "frameIndex",
          "timestamp",
          "metadata",
          "created_at" AS "createdAt"
        FROM "street_frames"
        WHERE "company_id" = ${options.companyId}
        ORDER BY COALESCE("timestamp", "created_at") DESC, "frame_index" ASC
      `;

  return rows.map(mapStreetFrameRow);
}

export async function insertStreetFrameSql(
  prisma: SqlExecutor,
  input: {
    id: string;
    companyId: number;
    obraId?: number | null;
    uploadedByUserId?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    heading?: number | null;
    imageUrl: string;
    storagePath: string;
    videoId: string;
    frameIndex: number;
    timestamp?: Date | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<StreetFrameRecord> {
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
  const rows = await prisma.$queryRaw<StreetFrameRow[]>`
    INSERT INTO "street_frames" (
      "id",
      "company_id",
      "obra_id",
      "uploaded_by_user_id",
      "latitude",
      "longitude",
      "heading",
      "image_url",
      "storage_path",
      "video_id",
      "frame_index",
      "timestamp",
      "metadata"
    )
    VALUES (
      ${input.id},
      ${input.companyId},
      ${input.obraId ?? null},
      ${input.uploadedByUserId ?? null},
      ${input.latitude ?? null},
      ${input.longitude ?? null},
      ${input.heading ?? null},
      ${input.imageUrl},
      ${input.storagePath},
      ${input.videoId},
      ${input.frameIndex},
      ${input.timestamp ?? null},
      ${metadataJson}::jsonb
    )
    RETURNING
      "id",
      "company_id" AS "companyId",
      "obra_id" AS "obraId",
      "uploaded_by_user_id" AS "uploadedByUserId",
      "latitude",
      "longitude",
      "heading",
      "image_url" AS "imageUrl",
      "storage_path" AS "storagePath",
      "video_id" AS "videoId",
      "frame_index" AS "frameIndex",
      "timestamp",
      "metadata",
      "created_at" AS "createdAt"
  `;

  return mapStreetFrameRow(rows[0]!);
}

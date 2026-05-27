import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { NextResponse } from "next/server";

import { nextResponseDbFailure } from "@/lib/db-route-error";
import { insertGeoPhotoSql, listGeoPhotosSql } from "@/lib/geo-media-sql";
import { resolveGeoScopeFromRequest } from "@/lib/geo-scope";
import { prisma } from "@/lib/prisma";
import { uploadToStorageBucket } from "@/lib/supabase/storage-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(value: FormDataEntryValue | null): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = await resolveGeoScopeFromRequest(req, {
    companyId: url.searchParams.get("companyId"),
    obraId: url.searchParams.get("obraId"),
  });
  if (!scope.ok) return scope.response;

  try {
    const rows = await listGeoPhotosSql(prisma, scope.scope);
    return NextResponse.json(rows);
  } catch (error) {
    return nextResponseDbFailure(error);
  }
}

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Falha ao ler multipart/form-data." }, { status: 400 });
  }

  const scope = await resolveGeoScopeFromRequest(req, {
    companyId: formData.get("companyId"),
    obraId: formData.get("obraId"),
    requireWrite: true,
  });
  if (!scope.ok) return scope.response;

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Imagem é obrigatória." }, { status: 400 });
  }
  if (!fileEntry.type.startsWith("image/")) {
    return NextResponse.json({ error: "O ficheiro enviado não é uma imagem." }, { status: 400 });
  }

  const latitude = parseOptionalNumber(formData.get("latitude"));
  const longitude = parseOptionalNumber(formData.get("longitude"));
  if (latitude == null || longitude == null) {
    return NextResponse.json(
      { error: "Latitude e longitude são obrigatórias para fotos GEO." },
      { status: 400 },
    );
  }

  const altitude = parseOptionalNumber(formData.get("altitude"));
  const capturedAt = parseOptionalDate(formData.get("capturedAt"));
  const originalName = fileEntry.name || "geo-photo.jpg";
  const safeName = sanitizeFileName(originalName) || `geo-photo${extname(originalName) || ".jpg"}`;
  const objectKey = `${scope.scope.companyId}/${scope.scope.obraId ?? "sem-obra"}/${randomUUID()}-${safeName}`;

  try {
    const upload = await uploadToStorageBucket({
      bucket: "geo-photos",
      path: objectKey,
      bytes: await fileEntry.arrayBuffer(),
      contentType: fileEntry.type || "image/jpeg",
      cacheControl: "3600",
    });

    const metadataRaw = formData.get("metadata");
    let metadata: Record<string, unknown> | null = null;
    if (typeof metadataRaw === "string" && metadataRaw.trim() !== "") {
      try {
        const parsed = JSON.parse(metadataRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          metadata = parsed as Record<string, unknown>;
        }
      } catch {
        metadata = null;
      }
    }

    const row = await insertGeoPhotoSql(prisma, {
      companyId: scope.scope.companyId,
      obraId: scope.scope.obraId,
      uploadedByUserId: scope.scope.uploadedByUserId,
      latitude,
      longitude,
      altitude,
      imageUrl: upload.publicUrl,
      storagePath: upload.storagePath,
      originalName,
      capturedAt,
      metadata,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao gravar foto georreferenciada.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

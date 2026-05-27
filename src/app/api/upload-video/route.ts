import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { insertStreetFrameSql } from "@/lib/geo-media-sql";
import { resolveGeoScopeFromRequest } from "@/lib/geo-scope";
import { prisma } from "@/lib/prisma";
import { uploadToStorageBucket } from "@/lib/supabase/storage-admin";
import {
  buildStoredFramePath,
  buildStoredVideoPath,
  detectVideoToolAvailability,
  extractStreetFramesFromVideo,
  readTempFileBytes,
  removeTempDir,
} from "@/lib/video-tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Vídeo é obrigatório." }, { status: 400 });
  }
  if (!fileEntry.type.startsWith("video/")) {
    return NextResponse.json({ error: "O ficheiro enviado não é um vídeo." }, { status: 400 });
  }

  const toolAvailability = await detectVideoToolAvailability();
  if (!toolAvailability.ffmpeg) {
    return NextResponse.json(
      {
        error:
          "FFmpeg não está disponível no ambiente atual. A rota foi criada, mas a extração automática de frames depende desta ferramenta.",
        tools: toolAvailability,
      },
      { status: 503 },
    );
  }

  const videoId = randomUUID();
  let workingDir: string | null = null;

  try {
    const extraction = await extractStreetFramesFromVideo(fileEntry, videoId);
    workingDir = extraction.workingDir;

    if (extraction.frames.length === 0) {
      return NextResponse.json(
        {
          error: "O vídeo foi processado, mas nenhum frame foi extraído em 1 fps.",
          videoId,
          tools: extraction.tools,
          warnings: extraction.warnings,
        },
        { status: 422 },
      );
    }

    const originalVideoUpload = await uploadToStorageBucket({
      bucket: "street-videos",
      path: buildStoredVideoPath(scope.scope.companyId, videoId, fileEntry.name || "video.mp4"),
      bytes: await readTempFileBytes(extraction.originalFilePath),
      contentType: fileEntry.type || "video/mp4",
      cacheControl: "3600",
    });

    const uploadedFrames = [];
    for (const frame of extraction.frames) {
      const storage = await uploadToStorageBucket({
        bucket: "street-frames",
        path: buildStoredFramePath(scope.scope.companyId, videoId, frame.fileName),
        bytes: await readTempFileBytes(frame.filePath),
        contentType: "image/jpeg",
        cacheControl: "3600",
      });
      uploadedFrames.push({
        frame,
        storage,
      });
    }

    const records = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const { frame, storage } of uploadedFrames) {
        out.push(
          await insertStreetFrameSql(tx, {
            id: `${videoId}:${String(frame.frameIndex).padStart(4, "0")}`,
            companyId: scope.scope.companyId,
            obraId: scope.scope.obraId,
            uploadedByUserId: scope.scope.uploadedByUserId,
            latitude: frame.latitude,
            longitude: frame.longitude,
            heading: frame.heading,
            imageUrl: storage.publicUrl,
            storagePath: storage.storagePath,
            videoId,
            frameIndex: frame.frameIndex,
            timestamp: frame.timestamp,
            metadata: frame.metadata,
          }),
        );
      }
      return out;
    });

    return NextResponse.json(
      {
        ok: true,
        videoId,
        videoUrl: originalVideoUpload.publicUrl,
        tools: extraction.tools,
        warnings: extraction.warnings,
        videoMetadata: {
          ...extraction.videoMetadata,
          capturedAt: extraction.videoMetadata.capturedAt
            ? extraction.videoMetadata.capturedAt.toISOString()
            : null,
        },
        frames: records,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao processar vídeo e extrair frames.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (workingDir) {
      await removeTempDir(workingDir);
    }
  }
}

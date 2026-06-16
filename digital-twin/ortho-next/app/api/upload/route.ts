import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import {
  SUPPORTED_RASTER_EXTENSIONS,
  UPLOADS_DIR,
  clearSlotFiles,
  getSlotFilePath,
  readRasterBounds,
} from "@/lib/paths";
import type { UploadSlot } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const slot = form.get("slot") as UploadSlot | null;
    const file = form.get("file");

    if (slot !== "T0" && slot !== "T1") {
      return NextResponse.json({ error: "slot must be T0 or T1." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Raster file is required." }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!SUPPORTED_RASTER_EXTENSIONS.includes(ext as (typeof SUPPORTED_RASTER_EXTENSIONS)[number])) {
      return NextResponse.json(
        { error: "Envie um raster suportado (.tif, .tiff, .geotiff, .ecw)." },
        { status: 400 },
      );
    }

    await mkdir(UPLOADS_DIR, { recursive: true });
    await clearSlotFiles(slot);

    const bytes = Buffer.from(await file.arrayBuffer());
    const dest = getSlotFilePath(slot, ext);
    await writeFile(dest, bytes);

    const bounds = await readRasterBounds(dest);

    return NextResponse.json({
      ok: true,
      slot,
      fileName: file.name,
      path: dest,
      bounds,
      extension: ext,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save raster.",
      },
      { status: 500 },
    );
  }
}

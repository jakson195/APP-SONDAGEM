import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { readGeotiffBounds } from "@/lib/geotiff-bounds";
import { T0_PATH, T1_PATH, UPLOADS_DIR } from "@/lib/paths";
import type { UploadSlot } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const SLOT_PATH: Record<UploadSlot, string> = {
  T0: T0_PATH,
  T1: T1_PATH,
};

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const slot = form.get("slot") as UploadSlot | null;
    const file = form.get("file");

    if (slot !== "T0" && slot !== "T1") {
      return NextResponse.json({ error: "slot deve ser T0 ou T1." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo GeoTIFF obrigatório." }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (![".tif", ".tiff", ".geotiff"].includes(ext)) {
      return NextResponse.json(
        { error: "Envie um GeoTIFF (.tif / .tiff)." },
        { status: 400 },
      );
    }

    await mkdir(UPLOADS_DIR, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    const dest = SLOT_PATH[slot];
    await writeFile(dest, bytes);

    const bounds = await readGeotiffBounds(dest);

    return NextResponse.json({
      ok: true,
      slot,
      fileName: file.name,
      path: dest,
      bounds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao guardar ortofoto.",
      },
      { status: 500 },
    );
  }
}

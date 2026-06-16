import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { UPLOADS_DIR } from "@/lib/paths";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".geotiff": "image/tiff",
  ".ecw": "image/x-ecw",
  ".json": "application/json",
  ".geojson": "application/geo+json",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path;
  const safe = segments.filter((part) => part !== ".." && part !== "");
  const filePath = path.join(UPLOADS_DIR, ...safe);

  if (!filePath.startsWith(UPLOADS_DIR)) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  try {
    await stat(filePath);
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(data, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Ficheiro não encontrado." }, { status: 404 });
  }
}

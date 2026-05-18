import { readFile } from "fs/promises";
import { basename, relative, resolve } from "path";
import { prisma } from "@/lib/prisma";
import { obraIdFromGeoProjectId } from "@/lib/geo-project-map";
import { insarStorageRoot } from "@/services/insar";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; rasterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { projectId, rasterId: rasterIdStr } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  const rid = Number(rasterIdStr);
  if (obraId === null || !Number.isFinite(rid)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const raster = await prisma.insarGeoRaster.findFirst({
    where: { id: rid, job: { obraId } },
    select: { relativePath: true, rasterKind: true },
  });

  if (!raster) {
    return NextResponse.json({ error: "Raster não encontrado" }, { status: 404 });
  }

  const root = resolve(insarStorageRoot());
  const segments = raster.relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter((s: string) => s && s !== "." && s !== "..");
  const absPath = resolve(root, ...segments);
  const relFromRoot = relative(root, absPath);
  if (relFromRoot.startsWith("..") || relFromRoot === "") {
    return NextResponse.json({ error: "Caminho inválido" }, { status: 400 });
  }

  const body = await readFile(absPath).catch(() => null);
  if (!body) {
    return NextResponse.json(
      {
        error: "Ficheiro GeoTIFF não encontrado no servidor.",
        hint: "Execute o pipeline InSAR neste ambiente ou configure armazenamento partilhado (INSAR_STORAGE_DIR).",
        path: raster.relativePath,
      },
      { status: 404 },
    );
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/tiff",
      "Content-Disposition": `attachment; filename="${basename(raster.relativePath)}"`,
      "X-Raster-Kind": raster.rasterKind,
    },
  });
}

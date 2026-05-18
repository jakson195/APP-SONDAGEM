import { readFile } from "fs/promises";
import { basename, relative, resolve } from "path";
import { prisma } from "@/lib/prisma";
import { insarStorageRoot } from "@/services/insar";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; rasterId: string }> };

function parseIds(idStr: string, rasterIdStr: string) {
  const obraId = Number(idStr);
  const rasterId = Number(rasterIdStr);
  return {
    ok: Number.isFinite(obraId) && Number.isFinite(rasterId),
    obraId,
    rasterId,
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr, rasterId: rasterIdStr } = await ctx.params;
  const { ok, obraId, rasterId } = parseIds(idStr, rasterIdStr);
  if (!ok) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const raster = await prisma.insarGeoRaster.findFirst({
    where: { id: rasterId, job: { obraId } },
    select: {
      relativePath: true,
      rasterKind: true,
    },
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

  const body = await readFile(absPath);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/tiff",
      "Content-Disposition": `attachment; filename="${basename(raster.relativePath)}"`,
      "X-Raster-Kind": raster.rasterKind,
    },
  });
}

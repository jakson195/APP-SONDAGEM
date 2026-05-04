import { prisma } from "@/lib/prisma";
import { isCampoTipo } from "@/lib/campo-sondagem-tipo";
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function generateStaticParams() {
  const rows = await prisma.obra.findMany({
    select: { id: true },
    take: 5000,
    orderBy: { id: "asc" },
  });
  return rows.map((r: { id: number }) => ({ id: String(r.id) }));
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const obraId = Number(idStr);

  if (!Number.isFinite(obraId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const tipoQ = searchParams.get("tipo");
  const tipoFiltrado =
    tipoQ !== null && tipoQ !== "" && isCampoTipo(tipoQ) ? tipoQ : undefined;

  const furos = await prisma.furo.findMany({
    where: {
      obraId,
      ...(tipoFiltrado != null ? { tipo: tipoFiltrado } : {}),
    },
    select: { id: true, codigo: true, tipo: true },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(furos);
}

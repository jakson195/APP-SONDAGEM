import { isCampoTipo } from "@/lib/campo-sondagem-tipo";
import { prisma } from "@/lib/prisma";
import { ssgObraIdCampoTipoParams } from "@/lib/ssg-static-params-from-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return ssgObraIdCampoTipoParams();
}

type Ctx = { params: Promise<{ id: string; tipo: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr, tipo } = await ctx.params;
  const obraId = Number(idStr);

  if (!Number.isFinite(obraId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  if (!isCampoTipo(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }

  const furos = await prisma.furo.findMany({
    where: { obraId, tipo },
    select: { id: true, codigo: true, tipo: true },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(furos);
}

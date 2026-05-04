import { prisma } from "@/lib/prisma";
import { isCampoTipo } from "@/lib/campo-sondagem-tipo";
import { ssgObraIdParams } from "@/lib/ssg-static-params-from-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return ssgObraIdParams();
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

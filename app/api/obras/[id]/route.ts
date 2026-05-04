import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ssgObraIdParams } from "@/lib/ssg-static-params-from-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return ssgObraIdParams();
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const obra = await prisma.obra.findUnique({ where: { id } });

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  return NextResponse.json(obra);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const existing = await prisma.obra.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const data: {
    nome?: string;
    latitude?: number | null;
    longitude?: number | null;
  } = {};

  if ("nome" in body && body.nome !== undefined) {
    if (typeof body.nome !== "string" || !body.nome.trim()) {
      return NextResponse.json(
        { error: "nome deve ser texto não vazio" },
        { status: 400 },
      );
    }
    data.nome = body.nome.trim();
  }

  const hasCoords = "latitude" in body || "longitude" in body;
  if (hasCoords) {
    if (!("latitude" in body) || !("longitude" in body)) {
      return NextResponse.json(
        {
          error:
            "Para atualizar coordenadas, envie latitude e longitude (ou null para limpar)",
        },
        { status: 400 },
      );
    }

    const clear =
      body.latitude === null ||
      body.latitude === "" ||
      body.longitude === null ||
      body.longitude === "";

    if (clear) {
      data.latitude = null;
      data.longitude = null;
    } else {
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return NextResponse.json(
          { error: "latitude deve ser um número entre -90 e 90" },
          { status: 400 },
        );
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return NextResponse.json(
          { error: "longitude deve ser um número entre -180 e 180" },
          { status: 400 },
        );
      }
      data.latitude = lat;
      data.longitude = lng;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Forneça nome e/ou latitude/longitude para atualizar" },
      { status: 400 },
    );
  }

  const obra = await prisma.obra.update({
    where: { id },
    data,
  });

  return NextResponse.json(obra);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const existing = await prisma.obra.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const resultado = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const furos = await tx.furo.findMany({
      where: { obraId: id },
      select: { id: true },
    });
    const furoIds = furos.map((f: { id: number }) => f.id);

    let sptApagados = 0;
    if (furoIds.length > 0) {
      const spt = await tx.sPT.deleteMany({
        where: { furoId: { in: furoIds } },
      });
      sptApagados = spt.count;
    }

    const furosDelete = await tx.furo.deleteMany({ where: { obraId: id } });
    await tx.obra.delete({ where: { id } });

    return {
      furosApagados: furosDelete.count,
      sptApagados,
    };
  });

  return NextResponse.json({ ok: true, ...resultado });
}

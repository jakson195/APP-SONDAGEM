import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ssgFuroIdParams } from "@/lib/ssg-static-params-from-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return ssgFuroIdParams();
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const furo = await prisma.furo.findUnique({
    where: { id },
    include: {
      obra: true,
      spt: {
        orderBy: { prof: "asc" },
      },
    },
  });

  if (!furo) {
    return NextResponse.json({ error: "Furo não encontrado" }, { status: 404 });
  }

  return NextResponse.json(furo);
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

  const existing = await prisma.furo.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Furo não encontrado" }, { status: 404 });
  }

  const data: {
    codigo?: string;
    latitude?: number | null;
    longitude?: number | null;
    dadosCampo?: Prisma.InputJsonValue | null;
  } = {};

  if (typeof body.codigo === "string") {
    const codigo = body.codigo.trim();
    if (!codigo) {
      return NextResponse.json(
        { error: "codigo não pode ser vazio" },
        { status: 400 },
      );
    }
    data.codigo = codigo;
  }

  const hasCoords = "latitude" in body && "longitude" in body;
  if (hasCoords) {
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

  if ("dadosCampo" in body && body.dadosCampo !== undefined) {
    const dc = body.dadosCampo;
    if (dc === null) {
      data.dadosCampo = null;
    } else if (typeof dc === "object") {
      data.dadosCampo = dc as Prisma.InputJsonValue;
    } else {
      return NextResponse.json(
        { error: "dadosCampo deve ser um objeto JSON ou null" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      {
        error:
          "Forneça codigo, dadosCampo ou latitude e longitude para atualizar",
      },
      { status: 400 },
    );
  }

  const furo = await prisma.furo.update({
    where: { id },
    data,
  });

  return NextResponse.json(furo);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const existing = await prisma.furo.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Furo não encontrado" }, { status: 404 });
  }

  await prisma.furo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

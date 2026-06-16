import type { ObraStatus, Prisma } from "@prisma/client";
import { serializeObraApi } from "@/lib/obra-api-serialize";
import { modulosProjetoFromUnknown } from "@/lib/modulos-projeto";
import { parseObraStatus } from "@/lib/obra-status";
import { syncProjectModules } from "@/lib/project-modules-db";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const obra = await prisma.obra.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      projectModules: { select: { module: true, active: true } },
    },
  });

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  return NextResponse.json(serializeObraApi(obra));
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

  const modulesPayload = modulosProjetoFromUnknown(body.modules);

  const data: {
    nome?: string;
    cliente?: string;
    local?: string;
    description?: string | null;
    status?: ObraStatus;
    latitude?: number | null;
    longitude?: number | null;
    company?: { connect: { id: number } };
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

  if ("cliente" in body && body.cliente !== undefined) {
    if (typeof body.cliente !== "string" || !body.cliente.trim()) {
      return NextResponse.json(
        { error: "cliente deve ser texto não vazio" },
        { status: 400 },
      );
    }
    data.cliente = body.cliente.trim();
  }

  if ("local" in body && body.local !== undefined) {
    if (typeof body.local !== "string" || !body.local.trim()) {
      return NextResponse.json(
        { error: "local deve ser texto não vazio" },
        { status: 400 },
      );
    }
    data.local = body.local.trim();
  }

  if ("description" in body) {
    if (body.description === null || body.description === "") {
      data.description = null;
    } else if (typeof body.description === "string") {
      data.description = body.description.trim() || null;
    } else {
      return NextResponse.json({ error: "description inválida" }, { status: 400 });
    }
  }

  if ("status" in body && body.status !== undefined) {
    const st = parseObraStatus(
      typeof body.status === "string" ? body.status : null,
    );
    if (!st) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    data.status = st;
  }

  const rawCid =
    body.companyId !== undefined ? body.companyId : body.empresaId;
  if (rawCid !== undefined) {
    const cid = Number(rawCid);
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: "companyId inválido" }, { status: 400 });
    }
    const c = await prisma.company.findUnique({
      where: { id: cid },
      select: { id: true },
    });
    if (!c) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }
    data.company = { connect: { id: Number(cid) } };
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

  if (Object.keys(data).length === 0 && !modulesPayload) {
    return NextResponse.json(
      { error: "Nada para atualizar" },
      { status: 400 },
    );
  }

  if (Object.keys(data).length > 0) {
    await prisma.obra.update({
      where: { id },
      data,
    });
  }

  if (modulesPayload) {
    await syncProjectModules(id, modulesPayload);
  }

  const obra = await prisma.obra.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      projectModules: { select: { module: true, active: true } },
    },
  });

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  return NextResponse.json(serializeObraApi(obra));
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

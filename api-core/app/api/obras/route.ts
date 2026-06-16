import { nextResponseDbFailure } from "@/lib/db-route-error";
import { serializeObraApi } from "@/lib/obra-api-serialize";
import {
  defaultModulosProjetoTodosAtivos,
  modulosProjetoFromUnknown,
} from "@/lib/modulos-projeto";
import { parseObraStatus } from "@/lib/obra-status";
import { syncProjectModules } from "@/lib/project-modules-db";
import { prisma } from "@/lib/prisma";
import type { ObraStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCompany =
      searchParams.get("companyId") ?? searchParams.get("empresaId");
    const companyId =
      rawCompany === null || rawCompany === "" ? null : Number(rawCompany);

    const statusFilter = parseObraStatus(searchParams.get("status"));
    const q = (searchParams.get("q") ?? "").trim();

    const parts: Prisma.ObraWhereInput[] = [];

    if (companyId !== null && Number.isFinite(companyId)) {
      parts.push({ companyId });
    }
    if (statusFilter) {
      parts.push({ status: statusFilter });
    }
    if (q) {
      parts.push({
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { cliente: { contains: q, mode: "insensitive" } },
          { local: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.ObraWhereInput =
      parts.length > 0 ? { AND: parts } : {};

    const obras = await prisma.obra.findMany({
      where,
      orderBy: { id: "desc" },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(obras.map((o) => serializeObraApi(o)));
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

export async function POST(req: Request) {
  let body: {
    nome?: unknown;
    cliente?: unknown;
    local?: unknown;
    description?: unknown;
    status?: unknown;
    empresaId?: unknown;
    companyId?: unknown;
    modules?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const cliente =
    typeof body.cliente === "string" ? body.cliente.trim() : "";
  const local = typeof body.local === "string" ? body.local.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const rawCid =
    body.companyId !== undefined && body.companyId !== null
      ? body.companyId
      : body.empresaId;
  const companyId = Number(rawCid);

  const statusParsed = parseObraStatus(
    typeof body.status === "string" ? body.status : null,
  );
  const status: ObraStatus = statusParsed ?? "ACTIVE";

  const modMap =
    modulosProjetoFromUnknown(body.modules) ?? defaultModulosProjetoTodosAtivos();

  if (!nome || !cliente || !local || !Number.isFinite(companyId)) {
    return NextResponse.json(
      {
        error:
          "nome, cliente, local e companyId (ou empresaId) válidos são obrigatórios",
      },
      { status: 400 },
    );
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    const obra = await prisma.obra.create({
      data: {
        nome,
        cliente,
        local,
        description,
        status,
        company: {
          connect: {
            id: Number(companyId),
          },
        },
      },
    });

    await syncProjectModules(obra.id, modMap);

    const full = await prisma.obra.findUnique({
      where: { id: obra.id },
      include: {
        company: { select: { id: true, name: true } },
        projectModules: { select: { module: true, active: true } },
      },
    });

    if (!full) {
      return NextResponse.json({ error: "Erro ao recarregar obra" }, { status: 500 });
    }

    return NextResponse.json(serializeObraApi(full));
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

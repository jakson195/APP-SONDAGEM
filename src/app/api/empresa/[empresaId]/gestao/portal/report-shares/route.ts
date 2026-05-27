import { NextResponse } from "next/server";
import { ensureUniqueReportShareSlug } from "@/lib/client-slug";
import { resolveGestorEmpresa } from "@/lib/empresa-gestao-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ empresaId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const empresaId = Number((await ctx.params).empresaId);
  const access = await resolveGestorEmpresa(req, empresaId);
  if (!access.ok) return access.response;

  const shares = await prisma.clientReportShare.findMany({
    where: { empresaId },
    orderBy: { createdAt: "desc" },
    include: {
      furo: {
        select: {
          id: true,
          codigo: true,
          tipo: true,
          obra: { select: { id: true, nome: true } },
        },
      },
    },
  });
  return NextResponse.json({ shares });
}

export async function POST(req: Request, ctx: Ctx) {
  const empresaId = Number((await ctx.params).empresaId);
  const access = await resolveGestorEmpresa(req, empresaId);
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const furoId = Number(body.furoId);
  if (!Number.isFinite(furoId) || furoId < 1) {
    return NextResponse.json({ error: "furoId inválido." }, { status: 400 });
  }

  const furo = await prisma.furo.findFirst({
    where: { id: furoId, obra: { companyId: empresaId } },
    select: {
      id: true,
      codigo: true,
      tipo: true,
      obra: { select: { id: true, nome: true } },
    },
  });
  if (!furo) {
    return NextResponse.json(
      { error: "Furo não encontrado para este cliente." },
      { status: 404 },
    );
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : `Relatório ${furo.codigo} · ${furo.obra.nome}`;
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const published =
    typeof body.published === "boolean" ? body.published : true;
  const existing = await prisma.clientReportShare.findUnique({
    where: { empresaId_furoId: { empresaId, furoId: furo.id } },
    select: { id: true },
  });
  const slug = await ensureUniqueReportShareSlug(title, existing?.id);

  const share = await prisma.clientReportShare.upsert({
    where: { empresaId_furoId: { empresaId, furoId: furo.id } },
    create: {
      empresaId,
      furoId: furo.id,
      title,
      description,
      published,
      slug,
      createdByUserId: access.user.id,
    },
    update: {
      title,
      description,
      published,
      slug,
      createdByUserId: access.user.id,
    },
    include: {
      furo: {
        select: {
          id: true,
          codigo: true,
          tipo: true,
          obra: { select: { id: true, nome: true } },
        },
      },
    },
  });

  return NextResponse.json({ share });
}

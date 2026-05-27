import { NextResponse } from "next/server";
import { ensureUniqueReportShareSlug } from "@/lib/client-slug";
import { resolveGestorEmpresa } from "@/lib/empresa-gestao-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ empresaId: string; shareId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { empresaId: empresaIdStr, shareId: shareIdStr } = await ctx.params;
  const empresaId = Number(empresaIdStr);
  const shareId = Number(shareIdStr);
  const access = await resolveGestorEmpresa(req, empresaId);
  if (!access.ok) return access.response;
  if (!Number.isFinite(shareId) || shareId < 1) {
    return NextResponse.json({ error: "shareId inválido." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const existing = await prisma.clientReportShare.findFirst({
    where: { id: shareId, empresaId },
    select: { id: true, slug: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Relatório compartilhado não encontrado." }, { status: 404 });
  }

  const data: {
    title?: string;
    description?: string | null;
    published?: boolean;
    slug?: string;
  } = {};

  if ("title" in body && typeof body.title === "string" && body.title.trim()) {
    const title = body.title.trim();
    data.title = title;
    data.slug = await ensureUniqueReportShareSlug(title, shareId);
  }
  if ("description" in body) {
    data.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }
  if ("published" in body && typeof body.published === "boolean") {
    data.published = body.published;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const share = await prisma.clientReportShare.update({
    where: { id: shareId },
    data,
  });
  return NextResponse.json({ share });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { empresaId: empresaIdStr, shareId: shareIdStr } = await ctx.params;
  const empresaId = Number(empresaIdStr);
  const shareId = Number(shareIdStr);
  const access = await resolveGestorEmpresa(req, empresaId);
  if (!access.ok) return access.response;
  if (!Number.isFinite(shareId) || shareId < 1) {
    return NextResponse.json({ error: "shareId inválido." }, { status: 400 });
  }

  const existing = await prisma.clientReportShare.findFirst({
    where: { id: shareId, empresaId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Relatório compartilhado não encontrado." }, { status: 404 });
  }

  await prisma.clientReportShare.delete({ where: { id: shareId } });
  return NextResponse.json({ ok: true });
}

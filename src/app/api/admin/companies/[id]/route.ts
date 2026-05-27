import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import {
  ensureUniqueCompanySlug,
  normalizeClientSlugInput,
  normalizePrimaryColor,
} from "@/lib/client-slug";
import { prisma } from "@/lib/prisma";
import { requireMasterAdminApi } from "@/lib/require-master-admin";
import type { SubscriptionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATUSES: SubscriptionStatus[] = [
  "ACTIVE",
  "TRIAL",
  "SUSPENDED",
  "CANCELLED",
];

function parseStatus(s: unknown): SubscriptionStatus | undefined {
  if (typeof s !== "string") return undefined;
  return STATUSES.includes(s as SubscriptionStatus)
    ? (s as SubscriptionStatus)
    : undefined;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { user, response } = await requireMasterAdminApi(req);
  if (!user) return response;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    await garantirModulosPadraoEmpresa(id);
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, systemRole: true } },
        obras: {
          orderBy: { id: "desc" },
          take: 100,
          select: {
            id: true,
            nome: true,
            cliente: true,
            local: true,
            status: true,
          },
        },
        reportShares: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            slug: true,
            title: true,
            published: true,
            createdAt: true,
            furo: {
              select: {
                id: true,
                codigo: true,
                obra: { select: { id: true, nome: true } },
              },
            },
          },
        },
        _count: { select: { obras: true, memberships: true, equipes: true } },
      },
    });
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }
    const furos = await prisma.furo.findMany({
      where: { obra: { companyId: id } },
      orderBy: [{ obraId: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        codigo: true,
        tipo: true,
        obra: { select: { id: true, nome: true } },
      },
    });
    return NextResponse.json({ company: { ...company, furos } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao carregar empresa." }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { user, response } = await requireMasterAdminApi(req);
  if (!user) return response;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: {
    name?: string;
    slug?: string;
    cnpj?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    logo?: string | null;
    primaryColor?: string | null;
    portalEnabled?: boolean;
    shareReportsEnabled?: boolean;
    plan?: string | null;
    status?: SubscriptionStatus;
    userId?: number;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if ("slug" in body) {
    const rawSlug = normalizeClientSlugInput(body.slug);
    data.slug = rawSlug
      ? await ensureUniqueCompanySlug(rawSlug, id)
      : await ensureUniqueCompanySlug(
          typeof body.name === "string" && body.name.trim() ? body.name.trim() : "cliente",
          id,
        );
  } else if (typeof body.name === "string" && body.name.trim()) {
    data.slug = await ensureUniqueCompanySlug(body.name.trim(), id);
  }
  if ("cnpj" in body) {
    data.cnpj =
      typeof body.cnpj === "string" && body.cnpj.trim()
        ? body.cnpj.trim()
        : null;
  }
  if ("phone" in body) {
    data.phone =
      typeof body.phone === "string" && body.phone.trim()
        ? body.phone.trim()
        : null;
  }
  if ("email" in body) {
    data.email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : null;
  }
  if ("address" in body) {
    data.address =
      typeof body.address === "string" && body.address.trim()
        ? body.address.trim()
        : null;
  }
  if ("logo" in body) {
    data.logo =
      typeof body.logo === "string" && body.logo.trim()
        ? body.logo.trim()
        : null;
  }
  if ("primaryColor" in body) {
    data.primaryColor = normalizePrimaryColor(body.primaryColor);
  }
  if ("portalEnabled" in body && typeof body.portalEnabled === "boolean") {
    data.portalEnabled = body.portalEnabled;
  }
  if (
    "shareReportsEnabled" in body &&
    typeof body.shareReportsEnabled === "boolean"
  ) {
    data.shareReportsEnabled = body.shareReportsEnabled;
  }
  if ("plan" in body) {
    data.plan =
      typeof body.plan === "string" && body.plan.trim()
        ? body.plan.trim()
        : null;
  }
  const st = parseStatus(body.status);
  if (st) data.status = st;

  if (typeof body.userId === "number" && Number.isFinite(body.userId)) {
    const u = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true },
    });
    if (!u) {
      return NextResponse.json({ error: "Utilizador dono inválido." }, { status: 400 });
    }
    data.userId = body.userId;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  try {
    const company = await prisma.company.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { obras: true, memberships: true } },
      },
    });

    if (data.userId != null) {
      await prisma.orgMembership.upsert({
        where: {
          userId_empresaId: { userId: data.userId, empresaId: id },
        },
        create: {
          userId: data.userId,
          empresaId: id,
          orgRole: "ADMIN",
        },
        update: { orgRole: "ADMIN" },
      });
    }

    return NextResponse.json({ company });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao atualizar (id ou CNPJ inválido?)." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { user, response } = await requireMasterAdminApi(req);
  if (!user) return response;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    await prisma.company.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao excluir empresa." }, { status: 500 });
  }
}

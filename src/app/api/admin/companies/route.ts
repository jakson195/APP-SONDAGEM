import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import {
  ensureUniqueCompanySlug,
  normalizeClientSlugInput,
  normalizePrimaryColor,
} from "@/lib/client-slug";
import { prisma } from "@/lib/prisma";
import { requireMasterAdminApi } from "@/lib/require-master-admin";
import { provisionPlatformUser } from "@/lib/supabase/provision-user";
import type { SubscriptionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATUSES: SubscriptionStatus[] = [
  "ACTIVE",
  "TRIAL",
  "SUSPENDED",
  "CANCELLED",
];

function parseStatus(s: string | null): SubscriptionStatus | undefined {
  if (!s) return undefined;
  return STATUSES.includes(s as SubscriptionStatus)
    ? (s as SubscriptionStatus)
    : undefined;
}

/** Lista empresas (SUPER_ADMIN / MASTER_ADMIN). */
export async function GET(req: Request) {
  const { user, response } = await requireMasterAdminApi(req);
  if (!user) return response;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const statusParam = parseStatus(searchParams.get("status"));

  const parts: object[] = [];
  if (statusParam) parts.push({ status: statusParam });
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { slug: { contains: q, mode: "insensitive" as const } },
        { cnpj: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  const where = parts.length ? { AND: parts } : {};

  try {
    const rows = await prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { obras: true, memberships: true } },
      },
    });
    return NextResponse.json({ companies: rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao listar empresas." }, { status: 500 });
  }
}

/** Cria empresa (dono opcional; por omissão o utilizador autenticado). */
export async function POST(req: Request) {
  const { user, response } = await requireMasterAdminApi(req);
  if (!user) return response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const ownerEmail =
    typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const ownerPassword =
    typeof body.ownerPassword === "string" ? body.ownerPassword : "";
  const ownerName =
    typeof body.ownerName === "string" ? body.ownerName.trim() : "";

  let ownerId =
    typeof body.userId === "number" && Number.isFinite(body.userId)
      ? body.userId
      : typeof body.userId === "string" && body.userId
        ? Number(body.userId)
        : user.id;

  let owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner && ownerEmail) {
    try {
      owner = await provisionPlatformUser({
        email: ownerEmail,
        password: ownerPassword,
        name: ownerName || null,
      });
      ownerId = owner.id;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Falha ao criar utilizador dono." },
        { status: 400 },
      );
    }
  }
  if (!owner) {
    return NextResponse.json(
      { error: "Utilizador dono inválido. Informe um ID válido ou email/senha do responsável." },
      { status: 400 },
    );
  }

  const cnpj =
    typeof body.cnpj === "string" && body.cnpj.trim()
      ? body.cnpj.trim()
      : null;
  const phone =
    typeof body.phone === "string" && body.phone.trim()
      ? body.phone.trim()
      : null;
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : null;
  const address =
    typeof body.address === "string" && body.address.trim()
      ? body.address.trim()
      : null;
  const logo =
    typeof body.logo === "string" && body.logo.trim()
      ? body.logo.trim()
      : null;
  const slugInput = normalizeClientSlugInput(body.slug);
  const primaryColor = normalizePrimaryColor(body.primaryColor);
  const portalEnabled =
    typeof body.portalEnabled === "boolean" ? body.portalEnabled : true;
  const shareReportsEnabled =
    typeof body.shareReportsEnabled === "boolean"
      ? body.shareReportsEnabled
      : true;
  const plan =
    typeof body.plan === "string" && body.plan.trim()
      ? body.plan.trim()
      : null;
  const status = parseStatus(
    typeof body.status === "string" ? body.status : null,
  );

  try {
    const slug = slugInput ?? (await ensureUniqueCompanySlug(name));
    const company = await prisma.company.create({
      data: {
        name,
        slug,
        userId: ownerId,
        cnpj,
        phone,
        email,
        address,
        logo,
        primaryColor,
        portalEnabled,
        shareReportsEnabled,
        plan,
        ...(status ? { status } : {}),
      },
    });

    await prisma.orgMembership.upsert({
      where: {
        userId_empresaId: { userId: ownerId, empresaId: company.id },
      },
      create: {
        userId: ownerId,
        empresaId: company.id,
        orgRole: "ADMIN",
      },
      update: { orgRole: "ADMIN" },
    });

    await garantirModulosPadraoEmpresa(company.id);

    const full = await prisma.company.findUnique({
      where: { id: company.id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { obras: true, memberships: true } },
      },
    });

    return NextResponse.json({ company: full });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao criar empresa (CNPJ duplicado?)." },
      { status: 500 },
    );
  }
}

import type { OrgMembership, OrgRole, SystemRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getAuthUserFromCookies, getAuthUserFromRequest } from "@/lib/server-auth";

type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUserFromRequest>>>;

export type ClientPortalCompany = {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  primaryColor: string | null;
  portalEnabled: boolean;
  shareReportsEnabled: boolean;
};

export type ClientPortalAccess = {
  user: AuthUser;
  company: ClientPortalCompany;
  membership: OrgMembership | null;
};

function canWriteRole(role: OrgRole): boolean {
  return role !== "VIEWER";
}

async function membershipForCompany(
  user: AuthUser,
  companyId: number,
): Promise<OrgMembership | null> {
  if (isPlatformSuperAdmin(user.systemRole)) return null;
  return prisma.orgMembership.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: companyId } },
  });
}

export async function listAccessibleCompaniesForUser(user: AuthUser) {
  if (isPlatformSuperAdmin(user.systemRole)) {
    return prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
  }
  const rows = await prisma.orgMembership.findMany({
    where: { userId: user.id },
    orderBy: { company: { name: "asc" } },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });
  return rows.map((row) => row.company);
}

export async function listAccessibleCompanyIdsForUser(user: AuthUser) {
  const companies = await listAccessibleCompaniesForUser(user);
  return companies.map((company) => company.id);
}

export async function requireCompanyAccessFromRequest(
  req: Request,
  companyId: number,
  options?: { write?: boolean },
): Promise<
  | { ok: true; user: AuthUser; membership: OrgMembership | null }
  | { ok: false; response: NextResponse }
> {
  if (!Number.isFinite(companyId) || companyId < 1) {
    return {
      ok: false,
      response: NextResponse.json({ error: "companyId inválido" }, { status: 400 }),
    };
  }

  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 }),
    };
  }

  const membership = await membershipForCompany(user, companyId);
  if (!isPlatformSuperAdmin(user.systemRole) && !membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem acesso a este cliente." }, { status: 403 }),
    };
  }
  if (options?.write && membership && !canWriteRole(membership.orgRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Perfil sem permissão de alteração neste cliente." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user, membership };
}

export async function requireClientPortalPageAccess(
  slug: string,
  nextPath = `/cliente/${slug}`,
): Promise<ClientPortalAccess> {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      primaryColor: true,
      portalEnabled: true,
      shareReportsEnabled: true,
    },
  });
  if (!company || !company.portalEnabled) notFound();

  const membership = await membershipForCompany(user, company.id);
  if (!isPlatformSuperAdmin(user.systemRole) && !membership) notFound();

  return {
    user,
    company,
    membership,
  };
}

export async function requireClientPortalAccessFromRequest(
  req: Request,
  slug: string,
  options?: { write?: boolean },
): Promise<
  | { ok: true; access: ClientPortalAccess }
  | { ok: false; response: NextResponse }
> {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      primaryColor: true,
      portalEnabled: true,
      shareReportsEnabled: true,
    },
  });
  if (!company || !company.portalEnabled) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Portal do cliente não encontrado." }, { status: 404 }),
    };
  }

  const membership = await membershipForCompany(user, company.id);
  if (!isPlatformSuperAdmin(user.systemRole) && !membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem acesso a este portal." }, { status: 403 }),
    };
  }
  if (options?.write && membership && !canWriteRole(membership.orgRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Perfil sem permissão de alteração neste cliente." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    access: { user, company, membership },
  };
}

export async function scopeWhereCompanyIdsForUser(
  user: AuthUser,
): Promise<{ companyId?: { in: number[] } }> {
  if (isPlatformSuperAdmin(user.systemRole)) return {};
  const ids = await listAccessibleCompanyIdsForUser(user);
  return { companyId: { in: ids.length > 0 ? ids : [-1] } };
}

export function isPlatformRole(systemRole: SystemRole): boolean {
  return isPlatformSuperAdmin(systemRole);
}

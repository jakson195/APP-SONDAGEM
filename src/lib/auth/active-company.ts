import { cookies } from "next/headers";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";

export const ACTIVE_COMPANY_COOKIE = "dg_active_company";

export async function getActiveCompanyIdFromCookies(): Promise<number | null> {
  const jar = await cookies();
  const raw = jar.get(ACTIVE_COMPANY_COOKIE)?.value;
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function resolveActiveCompanyForUser(
  userId: number,
  systemRole: string,
  preferredId?: number | null,
) {
  if (isPlatformSuperAdmin(systemRole as "MASTER_ADMIN" | "SUPER_ADMIN" | "USER")) {
    if (preferredId) {
      const c = await prisma.company.findUnique({ where: { id: preferredId } });
      if (c) return c;
    }
    const cookieId = await getActiveCompanyIdFromCookies();
    if (cookieId) {
      const c = await prisma.company.findUnique({ where: { id: cookieId } });
      if (c) return c;
    }
    return prisma.company.findFirst({ orderBy: { id: "asc" } });
  }

  const memberships = await prisma.orgMembership.findMany({
    where: { userId },
    include: { company: true },
    orderBy: { company: { name: "asc" } },
  });
  if (memberships.length === 0) return null;

  const cookieId = preferredId ?? (await getActiveCompanyIdFromCookies());
  if (cookieId) {
    const hit = memberships.find((m) => m.empresaId === cookieId);
    if (hit) return hit.company;
  }
  return memberships[0]!.company;
}

export type ActiveCompanyContext = {
  companyId: number;
  companyName: string;
  companySlug: string;
  orgRole: OrgRole | null;
  isPlatformAdmin: boolean;
};

export async function getActiveCompanyContext(
  user: { id: number; systemRole: string },
): Promise<ActiveCompanyContext | null> {
  const company = await resolveActiveCompanyForUser(user.id, user.systemRole);
  if (!company) return null;

  if (isPlatformSuperAdmin(user.systemRole as "MASTER_ADMIN" | "SUPER_ADMIN" | "USER")) {
    return {
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      orgRole: null,
      isPlatformAdmin: true,
    };
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: company.id } },
  });
  if (!membership) return null;

  return {
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
    orgRole: membership.orgRole,
    isPlatformAdmin: false,
  };
}

import type { OrgMembership, OrgRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export type AuthUserGestao = NonNullable<
  Awaited<ReturnType<typeof getAuthUserFromRequest>>
>;

/** Pode abrir o painel de gestão (admin da org ou mestre). */
export async function resolveGestorEmpresa(
  req: Request,
  empresaId: number,
): Promise<
  | { ok: true; user: AuthUserGestao; membership: OrgMembership | null }
  | { ok: false; response: NextResponse }
> {
  if (!Number.isFinite(empresaId) || empresaId < 1) {
    return {
      ok: false,
      response: NextResponse.json({ error: "empresaId inválido" }, { status: 400 }),
    };
  }

  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  if (isPlatformSuperAdmin(user.systemRole)) {
    const existe = await prisma.company.findUnique({
      where: { id: empresaId },
      select: { id: true },
    });
    if (!existe) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 }),
      };
    }
    return { ok: true, user, membership: null };
  }

  const membership = await prisma.orgMembership.findUnique({
    where: {
      userId_empresaId: { userId: user.id, empresaId },
    },
  });

  if (!membership || membership.orgRole !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Apenas administradores da empresa (ou ADM mestre) podem gerir utilizadores e módulos.",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, membership };
}

const ORG_ROLE_ORDER: OrgRole[] = ["VIEWER", "MEMBER", "MANAGER", "ADMIN"];

export function orgRoleIndex(r: OrgRole): number {
  return ORG_ROLE_ORDER.indexOf(r);
}

/**
 * Utilizador com acesso à empresa (leitura). Mestre: sem `OrgMembership` devolve `membership: null`.
 */
export async function assertMembroEmpresa(
  req: Request,
  empresaId: number,
): Promise<
  | { ok: true; user: AuthUserGestao; membership: OrgMembership | null }
  | { ok: false; response: NextResponse }
> {
  if (!Number.isFinite(empresaId) || empresaId < 1) {
    return {
      ok: false,
      response: NextResponse.json({ error: "empresaId inválido" }, { status: 400 }),
    };
  }

  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  if (isPlatformSuperAdmin(user.systemRole)) {
    const existe = await prisma.company.findUnique({
      where: { id: empresaId },
      select: { id: true },
    });
    if (!existe) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 }),
      };
    }
    return { ok: true, user, membership: null };
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId } },
  });

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Não pertence a esta empresa." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, membership };
}

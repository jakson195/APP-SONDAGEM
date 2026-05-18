import {
  modulosEfetivosParaMembro,
  sanitizarListaModulos,
} from "@/lib/modulos-permitidos";
import { MODULOS_PLATAFORMA } from "@/lib/modulos-plataforma";
import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mapa de acessos do utilizador: por empresa, papel e módulos efetivos
 * (interseção empresa ativa × lista explícita no vínculo, se houver).
 */
export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    if (isPlatformSuperAdmin(user.systemRole)) {
      return NextResponse.json({
        systemRole: user.systemRole,
        empresas: [] as const,
        modulosMaster: [...MODULOS_PLATAFORMA],
      });
    }

    const memberships = await prisma.orgMembership.findMany({
      where: { userId: user.id },
      include: {
        company: { select: { id: true, name: true } },
        equipe: { select: { id: true, nome: true } },
      },
    });

    const empresaIds = memberships.map((m) => m.empresaId);
    const modRows = await prisma.empresaModulo.findMany({
      where: { empresaId: { in: empresaIds }, ativo: true },
      select: { empresaId: true, modulo: true },
    });
    const ativosPorEmpresa = new Map<number, string[]>();
    for (const r of modRows) {
      const arr = ativosPorEmpresa.get(r.empresaId) ?? [];
      arr.push(r.modulo);
      ativosPorEmpresa.set(r.empresaId, arr);
    }

    const empresas = memberships.map((m) => {
      const ativos = ativosPorEmpresa.get(m.empresaId) ?? [];
      const modulosEfetivos = modulosEfetivosParaMembro(m.modulosPermitidos, ativos);
      return {
        empresaId: m.company.id,
        empresaNome: m.company.name,
        orgRole: m.orgRole,
        equipe: m.equipe,
        modulosAtivosNaEmpresa: ativos,
        modulosExplicitos:
          m.modulosPermitidos.length > 0
            ? sanitizarListaModulos(m.modulosPermitidos)
            : null,
        modulosEfetivos,
      };
    });

    return NextResponse.json({
      systemRole: user.systemRole,
      empresas,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao calcular acessos." }, { status: 500 });
  }
}

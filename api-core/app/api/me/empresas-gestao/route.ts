import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Empresas em que o utilizador pode abrir o painel de gestão (ADMIN ou mestre). */
export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    if (isPlatformSuperAdmin(user.systemRole)) {
      const empresas = await prisma.company.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return NextResponse.json({
        empresas: empresas.map((e) => ({ id: e.id, nome: e.name })),
      });
    }

    const rows = await prisma.orgMembership.findMany({
      where: { userId: user.id, orgRole: "ADMIN" },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { company: { name: "asc" } },
    });

    return NextResponse.json({
      empresas: rows.map((r) => ({
        id: r.company.id,
        nome: r.company.name,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao listar empresas." }, { status: 500 });
  }
}

import { prisma } from "@/lib/prisma";
import { requireMasterAdminApi } from "@/lib/require-master-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Painel mestre: contagens agregadas (expandir com CRUD depois). */
export async function GET(req: Request) {
  const { user, response } = await requireMasterAdminApi(req);
  if (!user) return response;

  const [
    empresas,
    users,
    obras,
    furos,
    memberships,
    equipes,
    modulos,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.user.count(),
    prisma.obra.count(),
    prisma.furo.count(),
    prisma.orgMembership.count(),
    prisma.equipe.count(),
    prisma.empresaModulo.count(),
  ]);

  return NextResponse.json({
    empresas,
    users,
    obras,
    furos,
    memberships,
    equipes,
    modulos,
    masterEmail: user.email,
  });
}

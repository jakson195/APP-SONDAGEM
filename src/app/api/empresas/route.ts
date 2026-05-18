import { nextResponseDbFailure } from "@/lib/db-route-error";
import { prisma } from "@/lib/prisma";
import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Lista empresas (para escolher na Nova obra). */
export async function GET() {
  try {
    const rows = await prisma.company.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json(rows.map((r) => ({ id: r.id, nome: r.name })));
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

/**
 * Cria empresa. Se não existir nenhum User, cria um utilizador demo
 * (password placeholder — substituir por registo real mais tarde).
 */
export async function POST(req: Request) {
  let body: { nome?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  }

  try {
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `demo-${Date.now()}@soilsul.local`,
          password: "-",
        },
      });
    }

    const company = await prisma.company.create({
      data: { name: nome, userId: user.id },
    });

    await prisma.orgMembership.upsert({
      where: {
        userId_empresaId: { userId: user.id, empresaId: company.id },
      },
      create: {
        userId: user.id,
        empresaId: company.id,
        orgRole: "ADMIN",
      },
      update: { orgRole: "ADMIN" },
    });

    await garantirModulosPadraoEmpresa(company.id);

    return NextResponse.json({ id: company.id, nome: company.name });
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

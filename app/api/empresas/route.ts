import { nextResponseDbFailure } from "@/lib/db-route-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Lista empresas (para escolher na Nova obra). */
export async function GET() {
  try {
    const empresas = await prisma.empresa.findMany({
      orderBy: { id: "asc" },
      select: { id: true, nome: true },
    });
    return NextResponse.json(empresas);
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

    const empresa = await prisma.empresa.create({
      data: { nome, userId: user.id },
    });

    return NextResponse.json(empresa);
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

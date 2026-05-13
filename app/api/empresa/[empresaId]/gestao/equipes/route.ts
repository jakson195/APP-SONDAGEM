import { resolveGestorEmpresa } from "@/lib/empresa-gestao-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ empresaId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { empresaId: idStr } = await ctx.params;
  const empresaId = Number(idStr);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;

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
    const equipe = await prisma.equipe.create({
      data: { nome, empresaId },
    });
    return NextResponse.json(equipe);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar equipa." }, { status: 500 });
  }
}

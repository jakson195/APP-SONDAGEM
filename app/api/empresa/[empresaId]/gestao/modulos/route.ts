import { resolveGestorEmpresa } from "@/lib/empresa-gestao-auth";
import { isModuloPlataformaChave } from "@/lib/modulos-plataforma";
import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ empresaId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { empresaId: idStr } = await ctx.params;
  const empresaId = Number(idStr);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;

  try {
    await garantirModulosPadraoEmpresa(empresaId);
    const modulos = await prisma.empresaModulo.findMany({
      where: { empresaId },
      orderBy: { modulo: "asc" },
    });
    return NextResponse.json({ modulos });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao listar módulos." }, { status: 500 });
  }
}

/** Corpo: { modulos: { spt?: boolean, geo?: boolean, ... } } — apenas chaves da plataforma. */
export async function PUT(req: Request, ctx: Ctx) {
  const { empresaId: idStr } = await ctx.params;
  const empresaId = Number(idStr);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;

  let body: { modulos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const modulos = body.modulos;
  if (!modulos || typeof modulos !== "object" || Array.isArray(modulos)) {
    return NextResponse.json(
      { error: "modulos deve ser um objeto { chave: boolean }" },
      { status: 400 },
    );
  }

  try {
    await garantirModulosPadraoEmpresa(empresaId);

    for (const [chave, val] of Object.entries(modulos)) {
      if (!isModuloPlataformaChave(chave)) continue;
      const ativo = Boolean(val);
      await prisma.empresaModulo.updateMany({
        where: { empresaId, modulo: chave },
        data: { ativo },
      });
    }

    const lista = await prisma.empresaModulo.findMany({
      where: { empresaId },
      orderBy: { modulo: "asc" },
    });
    return NextResponse.json({ modulos: lista });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao atualizar módulos." }, { status: 500 });
  }
}

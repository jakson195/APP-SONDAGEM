import { resolveGestorEmpresa } from "@/lib/empresa-gestao-auth";
import { intersecaoComModulosEmpresa, sanitizarListaModulos } from "@/lib/modulos-permitidos";
import { parseOrgRole } from "@/lib/org-role";
import { prisma } from "@/lib/prisma";
import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import bcrypt from "bcrypt";
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
    const [empresa, membros, equipes, modulos] = await Promise.all([
      prisma.company.findUnique({
        where: { id: empresaId },
        select: { id: true, name: true },
      }),
      prisma.orgMembership.findMany({
        where: { empresaId },
        include: {
          user: { select: { id: true, email: true, name: true, systemRole: true } },
          equipe: { select: { id: true, nome: true } },
        },
        orderBy: { id: "asc" },
      }),
      prisma.equipe.findMany({
        where: { empresaId },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
      prisma.empresaModulo.findMany({
        where: { empresaId },
        orderBy: { modulo: "asc" },
      }),
    ]);

    if (!empresa) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      empresa: empresa
        ? { id: empresa.id, nome: empresa.name }
        : null,
      membros,
      equipes,
      modulos,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao listar membros." }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { empresaId: idStr } = await ctx.params;
  const empresaId = Number(idStr);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;

  let body: {
    email?: unknown;
    orgRole?: unknown;
    password?: unknown;
    modulosPermitidos?: unknown;
    equipeId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "email é obrigatório" }, { status: 400 });
  }

  const orgRole = parseOrgRole(body.orgRole);
  if (!orgRole) {
    return NextResponse.json({ error: "orgRole inválido" }, { status: 400 });
  }

  const ativos = await prisma.empresaModulo.findMany({
    where: { empresaId, ativo: true },
    select: { modulo: true },
  });
  const ativosSet = new Set(ativos.map((m) => m.modulo));
  const modulosPerm = intersecaoComModulosEmpresa(
    sanitizarListaModulos(body.modulosPermitidos),
    ativosSet,
  );
  const modulosPermitidosDb =
    Array.isArray(body.modulosPermitidos) && body.modulosPermitidos.length > 0
      ? modulosPerm
      : [];

  let equipeId: number | null = null;
  if (body.equipeId != null && body.equipeId !== "") {
    const eid = Number(body.equipeId);
    if (Number.isFinite(eid)) {
      const eq = await prisma.equipe.findFirst({
        where: { id: eid, empresaId },
        select: { id: true },
      });
      if (eq) equipeId = eq.id;
    }
  }

  try {
    let target = await prisma.user.findUnique({ where: { email } });
    if (!target) {
      const plain =
        typeof body.password === "string" ? body.password : "";
      if (plain.length < 8) {
        return NextResponse.json(
          {
            error:
              "Utilizador inexistente. Indique uma password com pelo menos 8 caracteres para criar a conta.",
          },
          { status: 400 },
        );
      }
      const password = await bcrypt.hash(plain, 10);
      target = await prisma.user.create({
        data: {
          email,
          password,
          name: email.split("@")[0]?.slice(0, 80) || null,
        },
      });
    }

    const exists = await prisma.orgMembership.findUnique({
      where: {
        userId_empresaId: { userId: target.id, empresaId },
      },
    });
    if (exists) {
      return NextResponse.json(
        { error: "Este utilizador já pertence à empresa." },
        { status: 409 },
      );
    }

    const created = await prisma.orgMembership.create({
      data: {
        userId: target.id,
        empresaId,
        orgRole,
        equipeId,
        modulosPermitidos: modulosPermitidosDb,
      },
      include: {
        user: { select: { id: true, email: true, name: true, systemRole: true } },
        equipe: { select: { id: true, nome: true } },
      },
    });

    return NextResponse.json(created);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao adicionar membro." }, { status: 500 });
  }
}

import type { OrgRole } from "@prisma/client";
import { resolveGestorEmpresa } from "@/lib/empresa-gestao-auth";
import { intersecaoComModulosEmpresa, sanitizarListaModulos } from "@/lib/modulos-permitidos";
import { parseOrgRole } from "@/lib/org-role";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ empresaId: string; membershipId: string }>;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const { empresaId: eStr, membershipId: mStr } = await ctx.params;
  const empresaId = Number(eStr);
  const membershipId = Number(mStr);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;

  if (!Number.isFinite(membershipId)) {
    return NextResponse.json({ error: "membershipId inválido" }, { status: 400 });
  }

  let body: {
    orgRole?: unknown;
    modulosPermitidos?: unknown;
    equipeId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const current = await prisma.orgMembership.findFirst({
    where: { id: membershipId, empresaId },
  });
  if (!current) {
    return NextResponse.json({ error: "Vínculo não encontrado." }, { status: 404 });
  }

  const data: {
    orgRole?: OrgRole;
    modulosPermitidos?: string[];
    equipeId?: number | null;
  } = {};

  if (body.orgRole !== undefined) {
    const r = parseOrgRole(body.orgRole);
    if (!r) {
      return NextResponse.json({ error: "orgRole inválido" }, { status: 400 });
    }
    if (current.orgRole === "ADMIN" && r !== "ADMIN") {
      const admins = await prisma.orgMembership.count({
        where: { empresaId, orgRole: "ADMIN" },
      });
      if (admins <= 1) {
        return NextResponse.json(
          {
            error:
              "Não pode alterar o papel do único administrador da empresa. Promova outro utilizador a ADMIN primeiro.",
          },
          { status: 400 },
        );
      }
    }
    data.orgRole = r;
  }

  if (body.modulosPermitidos !== undefined) {
    const ativos = await prisma.empresaModulo.findMany({
      where: { empresaId, ativo: true },
      select: { modulo: true },
    });
    const ativosSet = new Set(ativos.map((m) => m.modulo));
    if (Array.isArray(body.modulosPermitidos) && body.modulosPermitidos.length === 0) {
      data.modulosPermitidos = [];
    } else {
      data.modulosPermitidos = intersecaoComModulosEmpresa(
        sanitizarListaModulos(body.modulosPermitidos),
        ativosSet,
      );
    }
  }

  if (body.equipeId !== undefined) {
    if (body.equipeId === null || body.equipeId === "") {
      data.equipeId = null;
    } else {
      const eid = Number(body.equipeId);
      if (!Number.isFinite(eid)) {
        return NextResponse.json({ error: "equipeId inválido" }, { status: 400 });
      }
      const eq = await prisma.equipe.findFirst({
        where: { id: eid, empresaId },
        select: { id: true },
      });
      if (!eq) {
        return NextResponse.json({ error: "Equipa não pertence à empresa." }, { status: 400 });
      }
      data.equipeId = eq.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  try {
    const updated = await prisma.orgMembership.update({
      where: { id: membershipId },
      data,
      include: {
        user: { select: { id: true, email: true, name: true, systemRole: true } },
        equipe: { select: { id: true, nome: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao atualizar." }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { empresaId: eStr, membershipId: mStr } = await ctx.params;
  const empresaId = Number(eStr);
  const membershipId = Number(mStr);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;

  if (!Number.isFinite(membershipId)) {
    return NextResponse.json({ error: "membershipId inválido" }, { status: 400 });
  }

  const current = await prisma.orgMembership.findFirst({
    where: { id: membershipId, empresaId },
  });
  if (!current) {
    return NextResponse.json({ error: "Vínculo não encontrado." }, { status: 404 });
  }

  if (current.orgRole === "ADMIN") {
    const admins = await prisma.orgMembership.count({
      where: { empresaId, orgRole: "ADMIN" },
    });
    if (admins <= 1) {
      return NextResponse.json(
        {
          error:
            "Não pode remover o único administrador da empresa. Promova outro utilizador a ADMIN primeiro.",
        },
        { status: 400 },
      );
    }
  }

  try {
    await prisma.orgMembership.delete({ where: { id: membershipId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao remover." }, { status: 500 });
  }
}

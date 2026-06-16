import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type BodyPayload = {
  nome?: unknown;
  metodo?: unknown;
  payload?: unknown;
};

function vesDelegate() {
  return (prisma as unknown as { vESProject?: typeof prisma.vESProject }).vESProject;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido." }, { status: 400 });
  }
  const ves = vesDelegate();
  if (!ves) {
    return NextResponse.json(
      { error: "Prisma Client desatualizado. Rode prisma generate no deploy." },
      { status: 503 },
    );
  }
  const project = await ves.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido." }, { status: 400 });
  }

  let body: BodyPayload;
  try {
    body = (await req.json()) as BodyPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const data: {
    nome?: string;
    metodo?: string;
    payload?: object;
  } = {};

  if (typeof body.nome === "string") {
    const nome = body.nome.trim();
    if (!nome) {
      return NextResponse.json(
        { error: "Nome não pode ser vazio." },
        { status: 400 },
      );
    }
    data.nome = nome;
  }
  if (typeof body.metodo === "string" && body.metodo.trim()) {
    data.metodo = body.metodo.trim();
  }
  if (body.payload != null) {
    if (typeof body.payload !== "object") {
      return NextResponse.json(
        { error: "Payload inválido." },
        { status: 400 },
      );
    }
    data.payload = body.payload as object;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Nada para atualizar." },
      { status: 400 },
    );
  }

  try {
    const ves = vesDelegate();
    if (!ves) {
      return NextResponse.json(
        { error: "Prisma Client desatualizado. Rode prisma generate no deploy." },
        { status: 503 },
      );
    }
    const updated = await ves.update({
      where: { id },
      data,
      select: {
        id: true,
        nome: true,
        metodo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um projeto com este nome." },
        { status: 409 },
      );
    }
    if (code === "P2025") {
      return NextResponse.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao atualizar projeto." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido." }, { status: 400 });
  }
  try {
    const ves = vesDelegate();
    if (!ves) {
      return NextResponse.json(
        { error: "Prisma Client desatualizado. Rode prisma generate no deploy." },
        { status: 503 },
      );
    }
    await ves.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      return NextResponse.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao remover projeto." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BodyPayload = {
  nome?: unknown;
  metodo?: unknown;
  payload?: unknown;
};

function vesDelegate() {
  return (prisma as unknown as { vESProject?: typeof prisma.vESProject }).vESProject;
}

export async function GET() {
  try {
    const ves = vesDelegate();
    if (!ves) {
      return NextResponse.json(
        { error: "Prisma Client desatualizado. Rode prisma generate no deploy." },
        { status: 503 },
      );
    }
    const projects = await ves.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        nome: true,
        metodo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ projects });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erro ao listar projetos VES.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: BodyPayload;
  try {
    body = (await req.json()) as BodyPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const metodo = typeof body.metodo === "string" ? body.metodo.trim() : "";
  const payload = body.payload;

  if (!nome) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }
  if (!metodo) {
    return NextResponse.json({ error: "Método é obrigatório." }, { status: 400 });
  }
  if (payload == null || typeof payload !== "object") {
    return NextResponse.json(
      { error: "Payload do projeto é obrigatório." },
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
    const created = await ves.create({
      data: {
        nome,
        metodo,
        payload: payload as object,
      },
      select: {
        id: true,
        nome: true,
        metodo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(created);
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
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erro ao criar projeto VES.",
      },
      { status: 500 },
    );
  }
}

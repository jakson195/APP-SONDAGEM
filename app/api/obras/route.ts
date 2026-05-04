import { nextResponseDbFailure } from "@/lib/db-route-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("empresaId");
    const empresaId =
      raw === null || raw === "" ? null : Number(raw);

    const where =
      empresaId !== null && Number.isFinite(empresaId)
        ? { empresaId }
        : {};

    const obras = await prisma.obra.findMany({
      where,
      orderBy: { id: "desc" },
    });

    return NextResponse.json(obras);
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

export async function POST(req: Request) {
  let body: {
    nome?: unknown;
    cliente?: unknown;
    local?: unknown;
    empresaId?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const cliente =
    typeof body.cliente === "string" ? body.cliente.trim() : "";
  const local = typeof body.local === "string" ? body.local.trim() : "";
  const empresaId = Number(body.empresaId);

  if (!nome || !cliente || !local || !Number.isFinite(empresaId)) {
    return NextResponse.json(
      { error: "nome, cliente, local e empresaId válidos são obrigatórios" },
      { status: 400 },
    );
  }

  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
    });

    if (!empresa) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    const obra = await prisma.obra.create({
      data: {
        nome,
        cliente,
        local,
        empresaId,
      },
    });

    return NextResponse.json(obra);
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

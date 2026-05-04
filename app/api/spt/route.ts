import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const prof = Number(body.prof ?? body.profundidade);
  const g1 = Number(body.g1 ?? body.n1 ?? 0);
  const g2 = Number(body.g2 ?? body.n2 ?? 0);
  const g3 = Number(body.g3 ?? body.n3 ?? 0);
  const solo = typeof body.solo === "string" ? body.solo : String(body.solo ?? "");
  const furoId = Number(body.furoId);

  const parseCm = (v: unknown, fallback: number) => {
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(999, Math.round(n));
  };
  const cm1 = parseCm(body.cm1, 15);
  const cm2 = parseCm(body.cm2, 15);
  const cm3 = parseCm(body.cm3, 15);

  if (!Number.isFinite(prof) || !Number.isFinite(furoId)) {
    return NextResponse.json(
      { error: "prof e furoId válidos são obrigatórios" },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(g1) ||
    !Number.isInteger(g2) ||
    !Number.isInteger(g3) ||
    !Number.isInteger(cm1) ||
    !Number.isInteger(cm2) ||
    !Number.isInteger(cm3)
  ) {
    return NextResponse.json(
      { error: "g1–g3 e cm1–cm3 devem ser inteiros" },
      { status: 400 },
    );
  }

  const furo = await prisma.furo.findUnique({ where: { id: furoId } });
  if (!furo) {
    return NextResponse.json({ error: "Furo não encontrado" }, { status: 404 });
  }

  const item = await prisma.sPT.create({
    data: {
      prof,
      g1,
      g2,
      g3,
      cm1,
      cm2,
      cm3,
      solo,
      furoId,
    },
  });

  return NextResponse.json(item);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("furoId");
  const furoId = raw === null || raw === "" ? NaN : Number(raw);

  if (!Number.isFinite(furoId)) {
    return NextResponse.json(
      { error: "Query furoId é obrigatória e deve ser numérica" },
      { status: 400 },
    );
  }

  const dados = await prisma.sPT.findMany({
    where: { furoId },
    orderBy: { prof: "asc" },
  });

  return NextResponse.json(dados);
}

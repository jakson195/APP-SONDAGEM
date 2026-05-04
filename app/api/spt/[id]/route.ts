import { prisma } from "@/lib/prisma";
import { ssgSptRowIdParams } from "@/lib/ssg-static-params-from-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return ssgSptRowIdParams();
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const existing = await prisma.sPT.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Registo SPT não encontrado" }, { status: 404 });
  }

  const prof = Number(body.prof ?? existing.prof);
  const g1 = Number(body.g1 ?? existing.g1);
  const g2 = Number(body.g2 ?? existing.g2);
  const g3 = Number(body.g3 ?? existing.g3);
  const solo = typeof body.solo === "string" ? body.solo : String(body.solo ?? existing.solo);

  const parseCm = (v: unknown, fallback: number) => {
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(999, Math.round(n));
  };
  const cm1 = parseCm(body.cm1, existing.cm1);
  const cm2 = parseCm(body.cm2, existing.cm2);
  const cm3 = parseCm(body.cm3, existing.cm3);

  if (!Number.isFinite(prof)) {
    return NextResponse.json({ error: "prof inválido" }, { status: 400 });
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

  const item = await prisma.sPT.update({
    where: { id },
    data: { prof, g1, g2, g3, cm1, cm2, cm3, solo },
  });

  return NextResponse.json(item);
}

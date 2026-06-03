import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth/active-company";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { user, response } = await requireAuth(req);
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const companyId = Number(body.companyId);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return NextResponse.json({ error: "companyId inválido." }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  if (!isPlatformSuperAdmin(user!.systemRole)) {
    const membership = await prisma.orgMembership.findUnique({
      where: { userId_empresaId: { userId: user!.id, empresaId: companyId } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
    }
  }

  const res = NextResponse.json({
    ok: true,
    company: { id: company.id, name: company.name, slug: company.slug },
  });
  res.cookies.set(ACTIVE_COMPANY_COOKIE, String(companyId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

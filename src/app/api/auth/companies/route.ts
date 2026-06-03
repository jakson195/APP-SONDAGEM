import { NextResponse } from "next/server";
import { listAccessibleCompaniesForUser } from "@/lib/client-portal-auth";
import { requireAuth } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, response } = await requireAuth(req);
  if (response) return response;

  const companies = await listAccessibleCompaniesForUser(user!);
  return NextResponse.json({ companies });
}

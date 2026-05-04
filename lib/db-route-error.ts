import { NextResponse } from "next/server";

/** Resposta JSON quando Prisma falha (ex.: `DATABASE_URL` em falta na Vercel). */
export function nextResponseDbFailure(cause: unknown) {
  console.error("[api/db]", cause);
  const extra =
    process.env.NODE_ENV !== "production" && cause instanceof Error
      ? ` ${cause.message}`
      : "";
  return NextResponse.json(
    {
      error: `Base de dados indisponível.${extra} Na Vercel: Settings → Environment Variables → DATABASE_URL (Postgres, ex. Neon), marcado para Production, Preview e Build.`,
    },
    { status: 503 },
  );
}

import { NextResponse } from "next/server";

function prismaErrorCode(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null) return undefined;
  const o = cause as { code?: unknown; errorCode?: unknown };
  if (typeof o.code === "string") return o.code;
  if (typeof o.errorCode === "string") return o.errorCode;
  return undefined;
}

function isMissingDatabaseUrl(cause: unknown): boolean {
  const msg = cause instanceof Error ? cause.message : String(cause);
  return /Environment variable not found:\s*DATABASE_URL/i.test(msg);
}

/** Servidor Postgres inacessível (Docker parado, porta errada, firewall). */
function isUnreachableDatabase(cause: unknown): boolean {
  const code = prismaErrorCode(cause);
  if (code === "P1001" || code === "P1000") return true;
  const msg = cause instanceof Error ? cause.message : String(cause);
  return /Can't reach database server|connection refused|ECONNREFUSED/i.test(msg);
}

function localDbHint(): string {
  return " Confirme PostgreSQL em execução (`npm run db:up` com Docker), depois `npm run db:push`. `DATABASE_URL` em `.env.local` (ver `.env.example`).";
}

/** Resposta JSON quando Prisma falha (ex.: `DATABASE_URL` em falta ou DB offline). */
export function nextResponseDbFailure(cause: unknown) {
  console.error("[api/db]", cause);
  const missingUrl = isMissingDatabaseUrl(cause);
  const unreachable = isUnreachableDatabase(cause);
  const onVercel = process.env.VERCEL === "1";
  const prod = process.env.NODE_ENV === "production";

  const extra =
    !missingUrl &&
    !unreachable &&
    process.env.NODE_ENV !== "production" &&
    cause instanceof Error
      ? ` ${cause.message}`
      : "";

  let fixHint: string;
  if (missingUrl) {
    fixHint =
      onVercel || prod
        ? " Defina `DATABASE_URL` no painel do projeto (Postgres) e marque para Production, Preview e Build."
        : " Em `.env.local` defina `DATABASE_URL` (veja `.env.example`). Se já estiver definida, verifique se o Postgres está a correr.";
  } else if (unreachable) {
    fixHint =
      onVercel || prod
        ? " Verifique `DATABASE_URL` (host/porta/rede) e se o Postgres aceita ligações."
        : localDbHint();
  } else {
    fixHint =
      " Na Vercel: Settings → Environment Variables → DATABASE_URL (Postgres, ex. Neon), marcado para Production, Preview e Build.";
  }

  return NextResponse.json(
    { error: `Base de dados indisponível.${extra}${fixHint}` },
    { status: 503 },
  );
}

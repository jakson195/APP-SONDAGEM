import { NextResponse } from "next/server";
import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import {
  geophysInvertHealthResponse,
  geophysInvertPostResponse,
} from "@/lib/geofisica/geophys-invert-proxy";

/** Literal exigido pelo Next.js. Máx. 800s no plano Vercel Pro. */
export const maxDuration = 800;
export const dynamic = "force-dynamic";

/** Health do motor Python — sem auth/assinatura (evita falso «motor offline»). */
export async function GET() {
  return geophysInvertHealthResponse();
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const obraId = body.obraId ?? body.obra_id;
  const companyId = body.companyId ?? body.empresaId;
  const bodyJson = JSON.stringify(body);

  return withGeophysicsApi(
    req,
    async () => {
      const replay = new Request(req.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyJson,
      });
      return geophysInvertPostResponse(replay);
    },
    {
      obraId,
      companyId,
      requireWrite: true,
      allowGlobalScope: obraId == null && companyId == null,
    },
  );
}

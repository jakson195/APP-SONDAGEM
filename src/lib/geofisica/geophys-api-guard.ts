import { NextResponse } from "next/server";
import { resolveGeoScopeFromRequest, type GeoScope } from "@/lib/geo-scope";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";
import { requireAuth } from "@/lib/auth/require-auth";
import { assertGeophysicsModuleAllowed } from "@/lib/saas/enforce-limits";
import { assertSubscriptionAllowsAccess } from "@/lib/saas/subscription-service";
import { getActiveCompanyContext } from "@/lib/auth/active-company";

export type GeophysicsApiContext = {
  user: NonNullable<Awaited<ReturnType<typeof requireAuth>>["user"]>;
  scope: GeoScope;
};

export function parseScopeIdsFromBody(body: Record<string, unknown>) {
  const obraRaw = body.obraId ?? body.obra_id ?? body.projectId;
  const companyRaw = body.companyId ?? body.empresaId ?? body.company_id;
  return {
    obraId: obraRaw === undefined || obraRaw === null ? undefined : obraRaw,
    companyId:
      companyRaw === undefined || companyRaw === null ? undefined : companyRaw,
  };
}

export function parseScopeIdsFromSearchParams(url: string) {
  const sp = new URL(url).searchParams;
  return {
    obraId: sp.get("obraId") ?? sp.get("obra_id") ?? sp.get("projectId"),
    companyId: sp.get("companyId") ?? sp.get("empresaId"),
  };
}

/**
 * Autenticação + assinatura activa + acesso à empresa/obra + módulo geofísica.
 */
export async function requireGeophysicsApi(
  req: Request,
  input?: {
    obraId?: unknown;
    companyId?: unknown;
    requireWrite?: boolean;
    /** Se true, não exige obraId/companyId (usa empresa activa do utilizador). */
    allowGlobalScope?: boolean;
  },
): Promise<
  | { ok: true; ctx: GeophysicsApiContext }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireAuth(req);
  if (auth.response) return { ok: false, response: auth.response };

  let obraId = input?.obraId;
  let companyId = input?.companyId;

  if (obraId === undefined && companyId === undefined) {
    const fromUrl = parseScopeIdsFromSearchParams(req.url);
    obraId = fromUrl.obraId ?? undefined;
    companyId = fromUrl.companyId ?? undefined;
  }

  if (
    (obraId === undefined || obraId === null || obraId === "") &&
    (companyId === undefined || companyId === null || companyId === "") &&
    input?.allowGlobalScope
  ) {
    const active = await getActiveCompanyContext(auth.user!);
    if (!active) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Nenhuma empresa activa." },
          { status: 403 },
        ),
      };
    }
    companyId = active.companyId;
  }

  const scoped = await resolveGeoScopeFromRequest(req, {
    obraId,
    companyId,
    requireWrite: input?.requireWrite,
  });

  if (!scoped.ok) {
    const body = await scoped.response.json().catch(() => ({ error: "Acesso negado." }));
    return {
      ok: false,
      response: NextResponse.json(body, { status: scoped.response.status }),
    };
  }

  if (!isAuthBypassEnabled()) {
    const subCheck = await assertSubscriptionAllowsAccess(scoped.scope.companyId);
    if (!subCheck.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: subCheck.message, code: subCheck.code },
          { status: subCheck.code === "MISSING" ? 503 : 402 },
        ),
      };
    }
  }

  const modCheck = await assertGeophysicsModuleAllowed(scoped.scope.companyId);
  if (!modCheck.ok) return { ok: false, response: modCheck.response };

  return {
    ok: true,
    ctx: { user: auth.user!, scope: scoped.scope },
  };
}

/** Envolve handler de rota geofísica com guarda. */
export async function withGeophysicsApi(
  req: Request,
  handler: (ctx: GeophysicsApiContext, req: Request) => Promise<NextResponse>,
  options?: Parameters<typeof requireGeophysicsApi>[1],
): Promise<NextResponse> {
  const gate = await requireGeophysicsApi(req, options);
  if (!gate.ok) return gate.response;
  return handler(gate.ctx, req);
}

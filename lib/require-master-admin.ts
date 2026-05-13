import { NextResponse } from "next/server";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getAuthUserFromRequest } from "@/lib/server-auth";

/** Para rotas API: SUPER_ADMIN / MASTER_ADMIN ou resposta 403. */
export async function requireMasterAdminApi(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user || !isPlatformSuperAdmin(user.systemRole)) {
    return {
      user: null as null,
      response: NextResponse.json(
        { error: "Acesso reservado ao administrador da plataforma (SUPER_ADMIN)." },
        { status: 403 },
      ),
    };
  }
  return { user, response: null as null };
}

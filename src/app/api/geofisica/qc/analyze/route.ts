import { withGeophysicsApi } from "@/lib/geofisica/geophys-api-guard";
import { proxyGeophysicsPython } from "@/lib/geofisica/geophys-python-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withGeophysicsApi(
    req,
    async (_ctx, r) =>
      proxyGeophysicsPython("/api/v1/geophysics/qc/analyze-line", r, 30_000),
    { allowGlobalScope: true, requireWrite: true },
  );
}

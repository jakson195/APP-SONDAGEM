/** UUID demo devolvido por `GET /api/geo/v1/projects` quando não há PostGIS. */
export const GEO_DEMO_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Liga `projectId` do viewer Digital Twin a `obraId` na BD principal (Prisma).
 * UUID demo → variável de ambiente ou `1`.
 */
export function obraIdFromGeoProjectId(projectId: string): number | null {
  if (!projectId?.trim()) return null;
  const trimmed = projectId.trim();
  if (trimmed === GEO_DEMO_PROJECT_ID || trimmed === "demo") {
    const raw =
      process.env.DIGITAL_TWIN_INSAR_OBRA_ID ??
      process.env.NEXT_PUBLIC_DIGITAL_TWIN_OBRA_ID ??
      "1";
    const n = Number(String(raw).trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }
  const n = Number(trimmed);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return null;
}

import type { ModuloProjetoChave } from "@/lib/modulos-projeto";
import { moduleMapFromRows } from "@/lib/project-modules-db";

type ObraSerializeInput = {
  companyId: number;
  company?: { id: number; name: string };
  projectModules?: { module: string; active: boolean }[];
} & Record<string, unknown>;

export function serializeObraApi(row: ObraSerializeInput) {
  const { company, projectModules, ...rest } = row;
  const base = {
    ...rest,
    empresaId: row.companyId,
    companyId: row.companyId,
    company: company ?? undefined,
  };
  delete (base as { projectModules?: unknown }).projectModules;
  if (projectModules !== undefined) {
    return {
      ...base,
      modules: moduleMapFromRows(projectModules),
    } as typeof base & { modules: Record<ModuloProjetoChave, boolean> };
  }
  return base;
}

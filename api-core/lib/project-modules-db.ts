import { prisma } from "@/lib/prisma";
import {
  type ModuloProjetoChave,
  MODULOS_PROJETO,
  defaultModulosProjetoTodosAtivos,
  isModuloProjetoChave,
} from "@/lib/modulos-projeto";

export function moduleMapFromRows(
  rows: { module: string; active: boolean }[] | undefined,
): Record<ModuloProjetoChave, boolean> {
  const out = defaultModulosProjetoTodosAtivos();
  for (const k of MODULOS_PROJETO) out[k] = false;
  if (!rows?.length) return out;
  for (const r of rows) {
    if (isModuloProjetoChave(r.module)) {
      out[r.module] = r.active;
    }
  }
  return out;
}

export async function syncProjectModules(
  projectId: number,
  modules: Record<ModuloProjetoChave, boolean>,
): Promise<void> {
  await prisma.$transaction(
    MODULOS_PROJETO.map((key) =>
      prisma.projectModule.upsert({
        where: {
          projectId_module: { projectId, module: key },
        },
        create: {
          projectId,
          module: key,
          active: modules[key],
        },
        update: { active: modules[key] },
      }),
    ),
  );
}

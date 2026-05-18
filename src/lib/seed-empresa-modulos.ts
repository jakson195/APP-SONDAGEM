import { MODULOS_PLATAFORMA } from "@/lib/modulos-plataforma";
import { prisma } from "@/lib/prisma";

/** Garante uma linha por módulo da plataforma (ativos por defeito). */
export async function garantirModulosPadraoEmpresa(empresaId: number): Promise<void> {
  await prisma.empresaModulo.createMany({
    data: MODULOS_PLATAFORMA.map((modulo) => ({
      empresaId,
      modulo,
      ativo: true,
    })),
    skipDuplicates: true,
  });
}

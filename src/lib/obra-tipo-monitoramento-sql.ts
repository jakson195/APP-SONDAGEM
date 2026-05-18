import type { PrismaClient } from "@prisma/client";

import { isPgUndefinedColumnError } from "@/lib/pg-error-utils";

/**
 * Atualiza `tipo_monitoramento` sem depender do campo no `ObraCreateInput`
 * (útil quando o deploy corre com `@prisma/client` gerado antes da migração).
 * Se a coluna ainda não existir na BD (migrações em falta), ignora — não falha o fluxo.
 */
export async function setObraTipoMonitoramentoSql(
  prisma: PrismaClient,
  obraId: number,
  value: string | null,
): Promise<void> {
  try {
    if (value === null) {
      await prisma.$executeRaw`
        UPDATE "Obra" SET "tipo_monitoramento" = NULL WHERE "id" = ${obraId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "Obra" SET "tipo_monitoramento" = ${value} WHERE "id" = ${obraId}
      `;
    }
  } catch (e) {
    if (isPgUndefinedColumnError(e)) {
      console.warn(
        "[obra] Coluna tipo_monitoramento em falta na BD — corre `prisma migrate deploy` ou execute scripts/sql/add-obra-tipo-monitoramento.sql. Valor não gravado.",
      );
      return;
    }
    throw e;
  }
}

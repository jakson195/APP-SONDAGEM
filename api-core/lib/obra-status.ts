import type { ObraStatus } from "@prisma/client";

export const OBRA_STATUS_ORDER: ObraStatus[] = [
  "DRAFT",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
];

export const OBRA_STATUS_LABEL: Record<ObraStatus, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  ON_HOLD: "Em pausa",
  COMPLETED: "Concluído",
  ARCHIVED: "Arquivado",
};

export function parseObraStatus(v: string | null): ObraStatus | undefined {
  if (!v) return undefined;
  return OBRA_STATUS_ORDER.includes(v as ObraStatus) ? (v as ObraStatus) : undefined;
}

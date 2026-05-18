import { stat } from "fs/promises";
import { prisma } from "@/lib/prisma";

/** Já existe `.SAFE` válida em disco e registo marcado como pronto. */
export async function isSentinel1DownloadDuplicate(copernicusId: string): Promise<boolean> {
  const row = await prisma.sentinel1CatalogEntry.findUnique({
    where: { copernicusId },
  });
  if (!row?.localPath) return false;
  if (row.downloadStatus !== "ready") return false;
  if (row.integrityOk !== true) return false;
  try {
    const s = await stat(row.localPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

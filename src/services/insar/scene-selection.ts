import type { Sentinel1CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type InsarScenePair = {
  master: Sentinel1CatalogEntry;
  slave: Sentinel1CatalogEntry;
};

/**
 * Escolhe par master/slave (primeira e última cena pronta no intervalo).
 * Exige `.SAFE` local (`downloadStatus` ready, `integrityOk`, pasta existente).
 */
export async function pickMasterSlaveFromCatalog(options: {
  obraId: number;
  dateFrom: Date;
  dateTo: Date;
  orbitDirection?: string | null;
}): Promise<InsarScenePair | null> {
  const rows = await prisma.sentinel1CatalogEntry.findMany({
    where: {
      obraId: options.obraId,
      acquisitionAt: { gte: options.dateFrom, lte: options.dateTo },
      downloadStatus: "ready",
      integrityOk: true,
      localPath: { not: null },
      ...(options.orbitDirection
        ? { orbitDirection: options.orbitDirection }
        : {}),
    },
    orderBy: { acquisitionAt: "asc" },
  });

  if (rows.length < 2) return null;

  const master = rows[0];
  const slave = rows[rows.length - 1];
  if (master.copernicusId === slave.copernicusId) return null;
  return { master, slave };
}

/** Contagens para diagnóstico: todas as entradas no intervalo vs. SLC pronta localmente. */
export async function countSentinel1ForInsarWindow(options: {
  obraId: number;
  dateFrom: Date;
  dateTo: Date;
  orbitDirection?: string | null;
}): Promise<{ total: number; readySlc: number }> {
  const baseWhere = {
    obraId: options.obraId,
    acquisitionAt: { gte: options.dateFrom, lte: options.dateTo },
    ...(options.orbitDirection
      ? { orbitDirection: options.orbitDirection }
      : {}),
  };
  const [total, readySlc] = await Promise.all([
    prisma.sentinel1CatalogEntry.count({ where: baseWhere }),
    prisma.sentinel1CatalogEntry.count({
      where: {
        ...baseWhere,
        downloadStatus: "ready",
        integrityOk: true,
        localPath: { not: null },
      },
    }),
  ]);
  return { total, readySlc };
}

import { join } from "path";

/** Raiz para jobs temporários, GeoTIFF finais e caches InSAR. */
export function insarStorageRoot(): string {
  return (
    process.env.INSAR_STORAGE_DIR?.trim() ?? join(process.cwd(), "storage", "insar")
  );
}

/** Pasta de trabalho por job (entrada SNAP / artefactos intermédios). */
export function insarJobWorkDir(obraId: number, jobId: number): string {
  return join(insarStorageRoot(), "jobs", String(obraId), String(jobId));
}

/** GeoTIFF persistidos relativamente a `insarStorageRoot()`. */
export function insarProcessedRelDir(obraId: number, jobId: number): string {
  return join("processed", String(obraId), String(jobId));
}

export function insarProcessedAbsDir(obraId: number, jobId: number): string {
  return join(insarStorageRoot(), insarProcessedRelDir(obraId, jobId));
}

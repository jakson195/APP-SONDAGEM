import { readdir } from "fs/promises";
import { join } from "path";
import AdmZip from "adm-zip";

export function extractZipToDir(zipPath: string, destDir: string): void {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

export async function findSafeDirectory(rootDir: string): Promise<string | null> {
  async function walk(dir: string, depth: number): Promise<string | null> {
    if (depth > 12) return null;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.toUpperCase().endsWith(".SAFE")) return p;
        const nested = await walk(p, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(rootDir, 0);
}

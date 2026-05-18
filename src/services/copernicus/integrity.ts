import { createHash } from "crypto";
import { createReadStream } from "fs";

export async function sha256FileHex(filePath: string): Promise<string> {
  return hashFile("sha256", filePath);
}

export async function md5FileHex(filePath: string): Promise<string> {
  return hashFile("md5", filePath);
}

async function hashFile(alg: string, filePath: string): Promise<string> {
  const hash = createHash(alg);
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(filePath);
    rs.on("error", reject);
    rs.on("data", (c) => hash.update(c));
    rs.on("end", () => resolve());
  });
  return hash.digest("hex");
}

export type CatalogChecksum = { Algorithm: string; Value: string };

/** Alguns produtos OData expõem `Checksum: [{ Algorithm, Value }]`. */
export function readChecksumFromODataRaw(
  raw: Record<string, unknown>,
): CatalogChecksum | null {
  const c = raw.Checksum;
  if (!Array.isArray(c) || c.length === 0) return null;
  const first = c[0];
  if (!first || typeof first !== "object") return null;
  const o = first as Record<string, unknown>;
  const Algorithm = String(o.Algorithm ?? o.algorithm ?? "");
  const Value = String(
    o.Value ?? o.ChecksumValue ?? o.value ?? "",
  );
  if (!Value.trim()) return null;
  return { Algorithm: Algorithm || "UNKNOWN", Value };
}

export async function verifyAgainstCatalogChecksum(
  filePath: string,
  expected: CatalogChecksum,
): Promise<boolean> {
  const algo = expected.Algorithm.toUpperCase();
  const want = expected.Value.toLowerCase();
  if (algo.includes("MD5")) {
    return (await md5FileHex(filePath)).toLowerCase() === want;
  }
  if (algo.includes("SHA-256") || algo.includes("SHA256")) {
    return (await sha256FileHex(filePath)).toLowerCase() === want;
  }
  return false;
}

import path from "path";
import { access, readdir, unlink } from "fs/promises";
import { spawn } from "child_process";

import type { UploadSlot } from "@/lib/types";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
export const OUTPUT_DIR = path.join(UPLOADS_DIR, "output");

export const SUPPORTED_RASTER_EXTENSIONS = [
  ".tif",
  ".tiff",
  ".geotiff",
  ".ecw",
] as const;

export function getSlotFilePath(slot: UploadSlot, ext: string): string {
  return path.join(UPLOADS_DIR, `${slot}${ext.toLowerCase()}`);
}

export async function clearSlotFiles(slot: UploadSlot): Promise<void> {
  try {
    const files = await readdir(UPLOADS_DIR);
    const tasks = files
      .filter((name) => name.toLowerCase().startsWith(`${slot.toLowerCase()}.`))
      .map((name) =>
        unlink(path.join(UPLOADS_DIR, name)).catch(() => undefined),
      );
    await Promise.all(tasks);
  } catch {
    // uploads directory may not exist yet
  }
}

export async function resolveSlotFilePath(slot: UploadSlot): Promise<string | null> {
  for (const ext of SUPPORTED_RASTER_EXTENSIONS) {
    const candidate = getSlotFilePath(slot, ext);
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export async function readRasterBounds(
  filePath: string,
): Promise<[number, number, number, number]> {
  const python = process.env.PYTHON_BIN ?? "python";
  const escapedPath = filePath.replace(/\\/g, "\\\\");
  const script = [
    "import json, rasterio",
    "from rasterio.warp import transform_bounds",
    `path = r'''${escapedPath}'''`,
    "with rasterio.open(path) as src:",
    "  b = src.bounds",
    "  if src.crs:",
    "    west,south,east,north = transform_bounds(src.crs, 'EPSG:4326', b.left, b.bottom, b.right, b.top)",
    "  else:",
    "    west,south,east,north = b.left,b.bottom,b.right,b.top",
    "print(json.dumps([west,south,east,north]))",
  ].join("\n");

  return await new Promise((resolve, reject) => {
    const child = spawn(python, ["-c", script], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || "Failed to read raster bounds."));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as [
          number,
          number,
          number,
          number,
        ];
        resolve(parsed);
      } catch {
        reject(new Error("Invalid bounds response from rasterio."));
      }
    });
  });
}

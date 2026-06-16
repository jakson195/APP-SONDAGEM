import { access } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";

import { OUTPUT_DIR, T0_PATH, T1_PATH } from "@/lib/paths";
import type { ChangePointsGeoJSON, CompareMeta } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function runCompare(): Promise<{ stdout: string; stderr: string; code: number }> {
  const python = process.env.PYTHON_BIN ?? "python";
  const script = path.join(process.cwd(), "backend", "compare.py");

  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      ["-u", script, "--t0", T0_PATH, "--t1", T1_PATH, "--out", OUTPUT_DIR],
      { cwd: process.cwd() },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

export async function POST() {
  try {
    await access(T0_PATH);
    await access(T1_PATH);
  } catch {
    return NextResponse.json(
      { error: "Envie T0 e T1 antes de comparar." },
      { status: 400 },
    );
  }

  try {
    const { stdout, stderr, code } = await runCompare();
    if (code !== 0) {
      return NextResponse.json(
        {
          error: "Falha na comparação Python.",
          detail: stderr || stdout,
        },
        { status: 500 },
      );
    }

    const metaPath = path.join(OUTPUT_DIR, "meta.json");
    const pointsPath = path.join(OUTPUT_DIR, "points.geojson");
    const meta = JSON.parse(
      await (await import("fs/promises")).readFile(metaPath, "utf-8"),
    ) as CompareMeta;
    const pointsGeoJson = JSON.parse(
      await (await import("fs/promises")).readFile(pointsPath, "utf-8"),
    ) as ChangePointsGeoJSON;

    return NextResponse.json({
      ok: true,
      bounds: meta.bounds,
      pointCount: meta.pointCount,
      threshold: meta.threshold,
      heatmapUrl: "/api/files/output/heatmap.png",
      diffUrl: "/api/files/output/diff.tif",
      pointsGeoJson,
      log: stdout.trim(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao executar compare.py. Verifique Python e dependências em backend/.",
      },
      { status: 500 },
    );
  }
}

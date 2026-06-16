import { access } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";

import { loadCompareResultFromDisk } from "@/lib/load-compare-result";
import { OUTPUT_DIR, resolveSlotFilePath } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 300;

function runCompare(
  t0Path: string,
  t1Path: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const python = process.env.PYTHON_BIN ?? "python";
  const script = path.join(process.cwd(), "backend", "compare.py");

  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      ["-u", script, "--t0", t0Path, "--t1", t1Path, "--out", OUTPUT_DIR],
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

function parseCompareStdout(stdout: string): { ok?: boolean; error?: string } {
  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]!) as { ok?: boolean };
      if (parsed.ok === true) return parsed;
    } catch {
      continue;
    }
  }
  return { error: "Saída inválida do script de comparação." };
}

/** Retorna último resultado salvo em disco, se existir. */
export async function GET() {
  const result = await loadCompareResultFromDisk();
  if (!result) {
    return NextResponse.json({ error: "Nenhum resultado de comparação encontrado." }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function POST() {
  const t0Path = await resolveSlotFilePath("T0");
  const t1Path = await resolveSlotFilePath("T1");
  if (!t0Path || !t1Path) {
    return NextResponse.json(
      { error: "Envie T0 e T1 (TIFF/ECW) antes de comparar." },
      { status: 400 },
    );
  }
  await Promise.all([access(t0Path), access(t1Path)]);

  try {
    const { stdout, stderr, code } = await runCompare(t0Path, t1Path);
    if (code !== 0) {
      return NextResponse.json(
        {
          error: "Falha na comparação Python.",
          detail: stderr || stdout,
        },
        { status: 500 },
      );
    }

    const parsed = parseCompareStdout(stdout);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error ?? "Comparação não concluiu com sucesso.", detail: stdout },
        { status: 500 },
      );
    }

    const result = await loadCompareResultFromDisk();
    if (!result) {
      return NextResponse.json({ error: "Resultado não encontrado após comparação." }, { status: 500 });
    }

    return NextResponse.json({ ...result, log: stdout.trim() });
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

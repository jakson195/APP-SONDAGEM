import { existsSync } from "fs";
import { spawn } from "child_process";

/**
 * `gpt`/`.exe` do SNAP e um ficheiro `.xml` (GPF) que aceita parâmetros, por exemplo:
 * `-Pmaster=<pasta .SAFE>` `-Pslave=<pasta .SAFE>` `-PtargetFolder=<saída>`
 *
 * O grafo deve materializar: coregistro → interferograma → unwrap → mapa de deslocamento → GeoTIFF.
 */
export function snapInsarConfigured(): boolean {
  const gpt = process.env.SNAP_GPT_PATH?.trim();
  const graph = process.env.SNAP_INSAR_GRAPH_PATH?.trim();
  return Boolean(gpt && graph && existsSync(graph));
}

export async function runSnapInsarGraph(params: {
  masterSafePath: string;
  slaveSafePath: string;
  targetFolder: string;
}): Promise<{ stdout: string; stderr: string }> {
  const gpt = process.env.SNAP_GPT_PATH!.trim();
  const graph = process.env.SNAP_INSAR_GRAPH_PATH!.trim();

  const args = [
    graph,
    `-Pmaster=${params.masterSafePath}`,
    `-Pslave=${params.slaveSafePath}`,
    `-PtargetFolder=${params.targetFolder}`,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(gpt, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(process.env.SNAP_INSAR_TIMEOUT_MS ?? 86_400_000);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`SNAP GPT excedeu ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(
            `SNAP GPT terminou com código ${code}. stderr: ${stderr.slice(-4000)}`,
          ),
        );
      }
    });
  });
}

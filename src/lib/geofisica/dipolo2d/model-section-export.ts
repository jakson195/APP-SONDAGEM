import type { ResistivityColorScale } from "./colormap";
import {
  drawModelSection,
  renderModelSectionCanvas,
  type ModelDrawOptions,
} from "./dipolo-pseudo-draw";
import type { Dipolo2DInvertResult } from "./types";

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    "image/png",
    1,
  );
}

export function slugInvertExport(methodId: string): string {
  return methodId.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

export function exportInvertModelPng(
  result: Dipolo2DInvertResult,
  colorScale: ResistivityColorScale,
  drawOpts: ModelDrawOptions,
  exportWidthPx = 1400,
): void {
  const canvas = renderModelSectionCanvas(
    result.mLog10,
    result.nx,
    result.nz,
    result.xEdgesM,
    result.zEdgesM,
    colorScale,
    drawOpts,
    exportWidthPx,
  );
  if (!canvas) return;
  const name = `modelo_invertido_${slugInvertExport(result.methodId)}_${exportWidthPx}px.png`;
  downloadCanvasPng(canvas, name);
}

/** Redesenha canvas visível e devolve-o (útil antes de exportar a partir do ecrã). */
export function paintModelSectionToCanvas(
  canvas: HTMLCanvasElement,
  result: Dipolo2DInvertResult,
  colorScale: ResistivityColorScale,
  drawOpts: ModelDrawOptions,
): void {
  drawModelSection(
    canvas,
    result.mLog10,
    result.nx,
    result.nz,
    result.xEdgesM,
    result.zEdgesM,
    colorScale,
    drawOpts,
  );
}

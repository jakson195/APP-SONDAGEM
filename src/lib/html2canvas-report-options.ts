import type { Options } from "html2canvas";

/** Largura nominal A4 em px (~96dpi), alinhada aos componentes *-relatorio-*-pdf. */
export const PDF_REPORT_WIDTH_PX = 794;

/**
 * Opções de html2canvas para relatórios SOILSUL: evita windowWidth/Height (causam
 * grelhas desalinhadas) e força largura fixa no clone.
 */
export function html2canvasReportOptions(
  extra?: Partial<Options>,
): Partial<Options> {
  const w = `${PDF_REPORT_WIDTH_PX}px`;
  return {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    imageTimeout: 20000,
    /** false: com true, mapas e outras <img> por vezes saem em branco no PDF. */
    foreignObjectRendering: false,
    onclone: (_doc, cloned) => {
      const node = cloned as HTMLElement;
      node.style.width = w;
      node.style.minWidth = w;
      node.style.maxWidth = w;
      node.style.boxSizing = "border-box";
      node.style.transform = "none";
    },
    ...extra,
  };
}

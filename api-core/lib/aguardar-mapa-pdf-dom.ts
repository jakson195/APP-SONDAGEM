/** Espera o mapa estático (SptPdfStaticMap) estar rasterizado antes do html2canvas. */
export async function aguardarMapaPdfNoDom(
  container: HTMLElement,
  maxMs: number,
): Promise<void> {
  if (!container.querySelector("[data-spt-pdf-has-map]")) return;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (container.querySelector("[data-spt-pdf-map-status='error']")) return;
    const canvas = container.querySelector<HTMLCanvasElement>(
      "canvas[data-spt-static-map][data-spt-static-map-ready='1']",
    );
    if (canvas && canvas.width > 2 && canvas.height > 2) return;

    const img = container.querySelector<HTMLImageElement>("img[data-spt-static-map]");
    if (img && img.complete && img.naturalWidth > 0) {
      try {
        await img.decode();
      } catch {
        /* ignorar */
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
}

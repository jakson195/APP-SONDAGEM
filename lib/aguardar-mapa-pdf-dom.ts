/** Espera o PNG do mapa estático (SptPdfStaticMap) estar pronto antes do html2canvas. */
export async function aguardarMapaPdfNoDom(
  container: HTMLElement,
  maxMs: number,
): Promise<void> {
  if (!container.querySelector("[data-spt-pdf-has-map]")) return;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (container.querySelector("[data-spt-pdf-map-status='error']")) return;
    const img = container.querySelector<HTMLImageElement>(
      "img[data-spt-static-map]",
    );
    if (img && img.complete && img.naturalWidth > 0) return;
    await new Promise((r) => setTimeout(r, 120));
  }
}

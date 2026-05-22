/** Espera o mapa estático (SptPdfStaticMap) estar pronto antes do html2canvas. */
export async function aguardarMapaPdfNoDom(
  container: HTMLElement,
  maxMs: number,
): Promise<void> {
  if (!container.querySelector("[data-spt-pdf-has-map]")) return;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (container.querySelector("[data-spt-pdf-map-status='error']")) return;

    const host = container.querySelector<HTMLElement>(
      "[data-spt-pdf-map-status='ready']",
    );
    const img = container.querySelector<HTMLImageElement>(
      "img[data-spt-pdf-map-img]",
    );
    if (host && img?.complete && img.naturalWidth > 2 && img.naturalHeight > 2) {
      if (img.dataset.sptStaticMapReady === "1" || img.src.startsWith("data:image/")) {
        try {
          await img.decode();
        } catch {
          /* ignorar */
        }
        return;
      }
    }

    await new Promise((r) => setTimeout(r, 150));
  }
}

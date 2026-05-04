/** Espera imagens marcadas para o PDF (fotos de campo) carregarem antes do html2canvas. */
export async function waitReportImagesLoaded(
  container: HTMLElement,
  maxMs: number,
): Promise<void> {
  const imgs = container.querySelectorAll<HTMLImageElement>(
    "img[data-spt-pdf-foto]",
  );
  if (imgs.length === 0) return;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    let ok = true;
    for (const img of imgs) {
      if (!img.complete || img.naturalWidth < 1) {
        ok = false;
        break;
      }
    }
    if (ok) return;
    await new Promise((r) => setTimeout(r, 120));
  }
}

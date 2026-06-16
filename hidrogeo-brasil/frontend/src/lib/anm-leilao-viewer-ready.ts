export const ANM_LEILAO_VIEWER_READY = "anm-leilao-viewer-ready";

export function notifyAnmLeilaoViewerReady(): void {
  if (typeof window === "undefined") return;
  try {
    window.parent.postMessage({ type: ANM_LEILAO_VIEWER_READY }, "*");
  } catch {
    /* cross-origin */
  }
}

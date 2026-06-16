/** Sinaliza ao parent (DataGeo iframe) que o mapa terminou de carregar. */
export function notifyViewerReady(): void {
  if (typeof window === "undefined") return;
  try {
    window.parent.postMessage({ type: "hidrogeo-viewer-ready" }, "*");
  } catch {
    /* cross-origin — ignorar */
  }
}

/** Módulo ANM Leilão SOPLE — viewer próprio (/anm-leilao-viewer), sem HidroGeo. */
export function isLeilaoANMModule(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/anm-leilao-viewer");
}
